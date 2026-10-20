<?php
/**
 * ElectroLab - funzioni comuni dell'API account (PHP 7.4+ / 8.x, MySQL o SQLite).
 *
 * Sicurezza:
 * - password con password_hash / password_verify;
 * - sessioni proprie nel database: nel cookie c'è un token casuale, nel database solo il suo hash;
 * - cookie HttpOnly, SameSite=Strict, Secure se il sito è in HTTPS;
 * - ogni richiesta POST deve avere l'intestazione X-ElectroLab (bloccata dai browser per le richieste da altri siti);
 * - query sempre preparate; limite ai tentativi di accesso falliti per indirizzo IP.
 */
declare(strict_types=1);

if (!defined('ELECTROLAB_API')) {
    http_response_code(404);
    exit;
}

const SESSION_COOKIE = 'electrolab_session';
const SESSION_DAYS = 30;
const MAX_PROJECT_BYTES = 2000000;
const MAX_STATE_BYTES = 3000000;
const LOGIN_MAX_FAILURES = 10;
const LOGIN_WINDOW_S = 900;

// ------------------------------------------------------------------ risposte

function send(int $code, array $body): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function ok(array $data = []): void
{
    send(200, ['ok' => true] + $data);
}

function fail(int $code, string $message): void
{
    send($code, ['ok' => false, 'error' => $message]);
}

// ------------------------------------------------------------------ configurazione e database

function cfg(): array
{
    static $c = null;
    if ($c === null) {
        $file = __DIR__ . '/config.php';
        if (!is_file($file)) {
            fail(503, 'Database non configurato: manca api/config.php sul server.');
        }
        $c = require $file;
        if (!is_array($c) || empty($c['dsn'])) {
            fail(503, 'Configurazione del database non valida.');
        }
    }
    return $c;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $c = cfg();
        try {
            $pdo = new PDO($c['dsn'], $c['user'] ?? null, $c['password'] ?? null, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
        } catch (Throwable $e) {
            fail(503, 'Impossibile collegarsi al database: verifica che sia attivo e che i dati di accesso siano corretti.');
        }
    }
    return $pdo;
}

function isMysql(): bool
{
    return db()->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql';
}

function now(): string
{
    return gmdate('Y-m-d H:i:s');
}

/** Crea le tabelle se mancano. */
function ensureSchema(): void
{
    $pdo = db();
    if (isMysql()) {
        $opt = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
        $pdo->exec("CREATE TABLE IF NOT EXISTS el_users (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(40) NOT NULL UNIQUE,
            pass_hash VARCHAR(255) NOT NULL,
            role VARCHAR(10) NOT NULL DEFAULT 'user',
            disabled TINYINT(1) NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL,
            last_login DATETIME NULL
        ) $opt");
        $pdo->exec("CREATE TABLE IF NOT EXISTS el_sessions (
            token_hash CHAR(64) PRIMARY KEY,
            user_id INT UNSIGNED NOT NULL,
            expires_at DATETIME NOT NULL,
            INDEX (user_id)
        ) $opt");
        $pdo->exec("CREATE TABLE IF NOT EXISTS el_projects (
            user_id INT UNSIGNED NOT NULL,
            project_id VARCHAR(64) NOT NULL,
            name VARCHAR(200) NOT NULL,
            data MEDIUMTEXT NOT NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY (user_id, project_id)
        ) $opt");
        $pdo->exec("CREATE TABLE IF NOT EXISTS el_state (
            user_id INT UNSIGNED PRIMARY KEY,
            current_project MEDIUMTEXT NULL,
            lessons MEDIUMTEXT NULL,
            exercises MEDIUMTEXT NULL,
            updated_at DATETIME NOT NULL
        ) $opt");
        $pdo->exec("CREATE TABLE IF NOT EXISTS el_login_failures (
            ip VARCHAR(64) NOT NULL,
            at INT UNSIGNED NOT NULL,
            INDEX (ip)
        ) $opt");
    } else {
        $pdo->exec('CREATE TABLE IF NOT EXISTS el_users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, pass_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT \'user\', disabled INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, last_login TEXT NULL)');
        $pdo->exec('CREATE TABLE IF NOT EXISTS el_sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at TEXT NOT NULL)');
        $pdo->exec('CREATE TABLE IF NOT EXISTS el_projects (user_id INTEGER NOT NULL, project_id TEXT NOT NULL, name TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, project_id))');
        $pdo->exec('CREATE TABLE IF NOT EXISTS el_state (user_id INTEGER PRIMARY KEY, current_project TEXT NULL, lessons TEXT NULL, exercises TEXT NULL, updated_at TEXT NOT NULL)');
        $pdo->exec('CREATE TABLE IF NOT EXISTS el_login_failures (ip TEXT NOT NULL, at INTEGER NOT NULL)');
    }
}

/** true se non esiste ancora un amministratore (tabelle assenti comprese). */
function setupNeeded(): bool
{
    try {
        $n = (int) db()->query("SELECT COUNT(*) FROM el_users WHERE role = 'admin'")->fetchColumn();
        return $n === 0;
    } catch (PDOException $e) {
        return true;
    }
}

// ------------------------------------------------------------------ richiesta

function method(): string
{
    return $_SERVER['REQUEST_METHOD'] ?? 'GET';
}

/** Corpo JSON delle richieste POST, con controllo anti-CSRF. */
function body(int $maxBytes = MAX_STATE_BYTES + 100000): array
{
    if (method() !== 'POST') {
        fail(405, 'Metodo non consentito.');
    }
    if (($_SERVER['HTTP_X_ELECTROLAB'] ?? '') !== '1') {
        fail(403, 'Richiesta non consentita.');
    }
    $raw = file_get_contents('php://input', false, null, 0, $maxBytes + 1);
    if ($raw === false || strlen($raw) > $maxBytes) {
        fail(413, 'Dati troppo grandi.');
    }
    $data = json_decode($raw === '' ? '{}' : $raw, true);
    if (!is_array($data)) {
        fail(400, 'Dati non validi.');
    }
    return $data;
}

function str(array $b, string $key, int $max = 200): string
{
    $v = $b[$key] ?? '';
    if (!is_string($v) || strlen($v) > $max) {
        fail(400, "Campo non valido: $key.");
    }
    return $v;
}

function clientIp(): string
{
    return substr((string) ($_SERVER['REMOTE_ADDR'] ?? 'sconosciuto'), 0, 64);
}

function validUsername(string $u): bool
{
    return (bool) preg_match('/^[A-Za-z0-9._-]{3,40}$/', $u);
}

function validPassword(string $p): bool
{
    return strlen($p) >= 8 && strlen($p) <= 200;
}

// ------------------------------------------------------------------ sessioni

function isHttps(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
        || ((int) ($_SERVER['SERVER_PORT'] ?? 0) === 443);
}

function cookiePath(): string
{
    $dir = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/api/index.php')), '/');
    return ($dir === '' ? '' : $dir) . '/';
}

function setSessionCookie(string $value, int $expires): void
{
    setcookie(SESSION_COOKIE, $value, [
        'expires' => $expires,
        'path' => cookiePath(),
        'secure' => isHttps(),
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
}

function startSession(int $userId): void
{
    $token = bin2hex(random_bytes(32));
    $expires = time() + SESSION_DAYS * 86400;
    $pdo = db();
    $pdo->prepare('DELETE FROM el_sessions WHERE expires_at < ?')->execute([now()]);
    $pdo->prepare('INSERT INTO el_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
        ->execute([hash('sha256', $token), $userId, gmdate('Y-m-d H:i:s', $expires)]);
    $pdo->prepare('UPDATE el_users SET last_login = ? WHERE id = ?')->execute([now(), $userId]);
    setSessionCookie($token, $expires);
}

function endSession(): void
{
    $token = $_COOKIE[SESSION_COOKIE] ?? '';
    if (is_string($token) && $token !== '') {
        db()->prepare('DELETE FROM el_sessions WHERE token_hash = ?')->execute([hash('sha256', $token)]);
    }
    setSessionCookie('', time() - 3600);
}

/** Utente collegato, oppure null. */
function currentUser(): ?array
{
    static $user = false;
    if ($user !== false) {
        return $user;
    }
    $user = null;
    $token = $_COOKIE[SESSION_COOKIE] ?? '';
    if (!is_string($token) || !preg_match('/^[0-9a-f]{64}$/', $token)) {
        return null;
    }
    try {
        $st = db()->prepare('SELECT u.id, u.username, u.role, u.disabled FROM el_sessions s JOIN el_users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?');
        $st->execute([hash('sha256', $token), now()]);
        $row = $st->fetch();
    } catch (PDOException $e) {
        return null;
    }
    if ($row && !(int) $row['disabled']) {
        $user = ['id' => (int) $row['id'], 'username' => $row['username'], 'role' => $row['role']];
    }
    return $user;
}

function requireUser(): array
{
    $u = currentUser();
    if (!$u) {
        fail(401, 'Accesso richiesto.');
    }
    return $u;
}

function requireAdmin(): array
{
    $u = requireUser();
    if ($u['role'] !== 'admin') {
        fail(403, 'Riservato all\'amministratore.');
    }
    return $u;
}

// ------------------------------------------------------------------ tentativi di accesso

function tooManyFailures(): bool
{
    $st = db()->prepare('SELECT COUNT(*) FROM el_login_failures WHERE ip = ? AND at > ?');
    $st->execute([clientIp(), time() - LOGIN_WINDOW_S]);
    return (int) $st->fetchColumn() >= LOGIN_MAX_FAILURES;
}

function recordFailure(): void
{
    $pdo = db();
    $pdo->prepare('DELETE FROM el_login_failures WHERE at < ?')->execute([time() - LOGIN_WINDOW_S]);
    $pdo->prepare('INSERT INTO el_login_failures (ip, at) VALUES (?, ?)')->execute([clientIp(), time()]);
}

function clearFailures(): void
{
    db()->prepare('DELETE FROM el_login_failures WHERE ip = ?')->execute([clientIp()]);
}

// ------------------------------------------------------------------ dati

/** Valida un progetto ricevuto dal browser e ne restituisce id, nome e JSON. */
function projectPayload($p): array
{
    if (!is_array($p) || !isset($p['id'], $p['name']) || !is_string($p['id']) || !is_string($p['name'])) {
        fail(400, 'Progetto non valido.');
    }
    if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/', $p['id'])) {
        fail(400, 'Identificativo del progetto non valido.');
    }
    $json = json_encode($p, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false || strlen($json) > MAX_PROJECT_BYTES) {
        fail(413, 'Progetto troppo grande.');
    }
    $name = function_exists('mb_substr') ? mb_substr($p['name'], 0, 200) : substr($p['name'], 0, 200);
    return [$p['id'], $name, $json];
}

function upsertState(int $userId, array $fields): void
{
    $pdo = db();
    $exists = $pdo->prepare('SELECT 1 FROM el_state WHERE user_id = ?');
    $exists->execute([$userId]);
    if (!$exists->fetchColumn()) {
        $pdo->prepare('INSERT INTO el_state (user_id, updated_at) VALUES (?, ?)')->execute([$userId, now()]);
    }
    $sets = [];
    $vals = [];
    foreach ($fields as $col => $val) {
        $sets[] = "$col = ?";
        $vals[] = $val;
    }
    $sets[] = 'updated_at = ?';
    $vals[] = now();
    $vals[] = $userId;
    $pdo->prepare('UPDATE el_state SET ' . implode(', ', $sets) . ' WHERE user_id = ?')->execute($vals);
}
