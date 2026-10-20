<?php
/**
 * ElectroLab - API account.
 * Uso: index.php?action=<azione>; le azioni che modificano dati sono POST con corpo JSON
 * e intestazione "X-ElectroLab: 1".
 */
declare(strict_types=1);

define('ELECTROLAB_API', true);
require __DIR__ . '/lib.php';

$action = isset($_GET['action']) && is_string($_GET['action']) ? $_GET['action'] : '';

try {
    switch ($action) {
        // -------------------------------------------------------------- stato e configurazione iniziale
        case 'status':
            $needed = setupNeeded();
            ok(['setupNeeded' => $needed, 'setupAvailable' => $needed && !empty(cfg()['setup_token']), 'user' => $needed ? null : currentUser()]);

        case 'setup':
            $b = body();
            $token = (string) (cfg()['setup_token'] ?? '');
            if ($token === '') {
                fail(403, 'Configurazione iniziale non abilitata: imposta il secret SETUP_TOKEN.');
            }
            ensureSchema();
            if (tooManyFailures()) {
                fail(429, 'Troppi tentativi: riprova tra qualche minuto.');
            }
            if (!hash_equals($token, str($b, 'token'))) {
                recordFailure();
                fail(403, 'Codice di configurazione errato.');
            }
            if (!setupNeeded()) {
                fail(409, 'L\'amministratore esiste già.');
            }
            $username = str($b, 'username', 40);
            $password = str($b, 'password');
            if (!validUsername($username)) {
                fail(400, 'Nome utente: da 3 a 40 caratteri tra lettere, numeri, punto, trattino e trattino basso.');
            }
            if (!validPassword($password)) {
                fail(400, 'La password deve avere almeno 8 caratteri.');
            }
            db()->prepare("INSERT INTO el_users (username, pass_hash, role, created_at) VALUES (?, ?, 'admin', ?)")
                ->execute([$username, password_hash($password, PASSWORD_DEFAULT), now()]);
            $id = (int) db()->lastInsertId();
            clearFailures();
            startSession($id);
            ok(['user' => ['id' => $id, 'username' => $username, 'role' => 'admin']]);

        // -------------------------------------------------------------- accesso
        case 'login':
            $b = body();
            if (tooManyFailures()) {
                fail(429, 'Troppi tentativi falliti: riprova tra qualche minuto.');
            }
            $username = str($b, 'username', 40);
            $password = str($b, 'password');
            $st = db()->prepare('SELECT id, username, pass_hash, role, disabled FROM el_users WHERE username = ?');
            $st->execute([$username]);
            $row = $st->fetch();
            // Si verifica comunque un hash per non rivelare, dai tempi di risposta, se l'utente esiste.
            $hash = $row ? $row['pass_hash'] : password_hash('electrolab-utente-inesistente', PASSWORD_DEFAULT);
            $valid = password_verify($password, $hash) && $row && !(int) $row['disabled'];
            if (!$valid) {
                recordFailure();
                usleep(300000);
                fail(401, 'Nome utente o password errati.');
            }
            clearFailures();
            if (password_needs_rehash($row['pass_hash'], PASSWORD_DEFAULT)) {
                db()->prepare('UPDATE el_users SET pass_hash = ? WHERE id = ?')->execute([password_hash($password, PASSWORD_DEFAULT), $row['id']]);
            }
            startSession((int) $row['id']);
            ok(['user' => ['id' => (int) $row['id'], 'username' => $row['username'], 'role' => $row['role']]]);

        case 'logout':
            body();
            endSession();
            ok();

        case 'password':
            $u = requireUser();
            $b = body();
            $old = str($b, 'old');
            $new = str($b, 'new');
            if (!validPassword($new)) {
                fail(400, 'La nuova password deve avere almeno 8 caratteri.');
            }
            $st = db()->prepare('SELECT pass_hash FROM el_users WHERE id = ?');
            $st->execute([$u['id']]);
            if (!password_verify($old, (string) $st->fetchColumn())) {
                fail(403, 'La password attuale non è corretta.');
            }
            db()->prepare('UPDATE el_users SET pass_hash = ? WHERE id = ?')->execute([password_hash($new, PASSWORD_DEFAULT), $u['id']]);
            ok();

        // -------------------------------------------------------------- libreria progetti
        case 'projects':
            $u = requireUser();
            $st = db()->prepare('SELECT data FROM el_projects WHERE user_id = ? ORDER BY updated_at DESC');
            $st->execute([$u['id']]);
            $list = [];
            foreach ($st->fetchAll() as $r) {
                $p = json_decode($r['data'], true);
                if (is_array($p)) {
                    $list[] = $p;
                }
            }
            ok(['projects' => $list]);

        case 'project_save':
            $u = requireUser();
            $b = body(MAX_PROJECT_BYTES + 100000);
            [$id, $name, $json] = projectPayload($b['project'] ?? null);
            $pdo = db();
            $pdo->beginTransaction();
            $pdo->prepare('DELETE FROM el_projects WHERE user_id = ? AND project_id = ?')->execute([$u['id'], $id]);
            $pdo->prepare('INSERT INTO el_projects (user_id, project_id, name, data, updated_at) VALUES (?, ?, ?, ?, ?)')
                ->execute([$u['id'], $id, $name, $json, now()]);
            $pdo->commit();
            ok();

        case 'project_delete':
            $u = requireUser();
            $b = body();
            db()->prepare('DELETE FROM el_projects WHERE user_id = ? AND project_id = ?')->execute([$u['id'], str($b, 'id', 64)]);
            ok();

        // -------------------------------------------------------------- progetto in corso e progressi
        case 'state':
            $u = requireUser();
            $st = db()->prepare('SELECT current_project, lessons, exercises, updated_at FROM el_state WHERE user_id = ?');
            $st->execute([$u['id']]);
            $r = $st->fetch() ?: [];
            $dec = function ($v) {
                return is_string($v) ? json_decode($v, true) : null;
            };
            ok([
                'current' => $dec($r['current_project'] ?? null),
                'lessons' => $dec($r['lessons'] ?? null),
                'exercises' => $dec($r['exercises'] ?? null),
                'updatedAt' => $r['updated_at'] ?? null,
            ]);

        case 'state_save':
            $u = requireUser();
            $b = body();
            $fields = [];
            if (array_key_exists('current', $b)) {
                if ($b['current'] === null) {
                    $fields['current_project'] = null;
                } else {
                    [, , $json] = projectPayload($b['current']);
                    $fields['current_project'] = $json;
                }
            }
            foreach (['lessons' => 'lessons', 'exercises' => 'exercises'] as $key => $col) {
                if (array_key_exists($key, $b)) {
                    if (!is_array($b[$key])) {
                        fail(400, "Campo non valido: $key.");
                    }
                    $json = json_encode($b[$key], JSON_UNESCAPED_UNICODE);
                    if ($json === false || strlen($json) > 200000) {
                        fail(413, 'Dati troppo grandi.');
                    }
                    $fields[$col] = $json;
                }
            }
            if ($fields) {
                upsertState($u['id'], $fields);
            }
            ok();

        // -------------------------------------------------------------- amministrazione
        case 'users':
            requireAdmin();
            $rows = db()->query('SELECT id, username, role, disabled, created_at, last_login FROM el_users ORDER BY username')->fetchAll();
            ok(['users' => array_map(function ($r) {
                return ['id' => (int) $r['id'], 'username' => $r['username'], 'role' => $r['role'], 'disabled' => (bool) (int) $r['disabled'], 'createdAt' => $r['created_at'], 'lastLogin' => $r['last_login']];
            }, $rows)]);

        case 'user_create':
            requireAdmin();
            $b = body();
            $username = str($b, 'username', 40);
            $password = str($b, 'password');
            $role = ($b['role'] ?? 'user') === 'admin' ? 'admin' : 'user';
            if (!validUsername($username)) {
                fail(400, 'Nome utente: da 3 a 40 caratteri tra lettere, numeri, punto, trattino e trattino basso.');
            }
            if (!validPassword($password)) {
                fail(400, 'La password deve avere almeno 8 caratteri.');
            }
            $st = db()->prepare('SELECT 1 FROM el_users WHERE username = ?');
            $st->execute([$username]);
            if ($st->fetchColumn()) {
                fail(409, 'Esiste già un utente con questo nome.');
            }
            db()->prepare('INSERT INTO el_users (username, pass_hash, role, created_at) VALUES (?, ?, ?, ?)')
                ->execute([$username, password_hash($password, PASSWORD_DEFAULT), $role, now()]);
            ok(['id' => (int) db()->lastInsertId()]);

        case 'user_password':
            requireAdmin();
            $b = body();
            $id = (int) ($b['id'] ?? 0);
            $password = str($b, 'password');
            if (!validPassword($password)) {
                fail(400, 'La password deve avere almeno 8 caratteri.');
            }
            db()->prepare('UPDATE el_users SET pass_hash = ? WHERE id = ?')->execute([password_hash($password, PASSWORD_DEFAULT), $id]);
            db()->prepare('DELETE FROM el_sessions WHERE user_id = ?')->execute([$id]);
            ok();

        case 'user_disable':
            $me = requireAdmin();
            $b = body();
            $id = (int) ($b['id'] ?? 0);
            if ($id === $me['id']) {
                fail(400, 'Non puoi disattivare il tuo account.');
            }
            $disabled = !empty($b['disabled']) ? 1 : 0;
            db()->prepare('UPDATE el_users SET disabled = ? WHERE id = ?')->execute([$disabled, $id]);
            if ($disabled) {
                db()->prepare('DELETE FROM el_sessions WHERE user_id = ?')->execute([$id]);
            }
            ok();

        case 'user_delete':
            $me = requireAdmin();
            $b = body();
            $id = (int) ($b['id'] ?? 0);
            if ($id === $me['id']) {
                fail(400, 'Non puoi eliminare il tuo account.');
            }
            $pdo = db();
            $pdo->beginTransaction();
            foreach (['el_sessions', 'el_projects', 'el_state'] as $t) {
                $pdo->prepare("DELETE FROM $t WHERE user_id = ?")->execute([$id]);
            }
            $pdo->prepare('DELETE FROM el_users WHERE id = ?')->execute([$id]);
            $pdo->commit();
            ok();

        default:
            fail(404, 'Azione sconosciuta.');
    }
} catch (PDOException $e) {
    error_log('ElectroLab API: ' . $e->getMessage());
    fail(500, 'Errore del database.');
}
