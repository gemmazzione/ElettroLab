<?php
// Esempio di configurazione. Il file reale (config.php) NON va messo nel repository:
// lo crea la GitHub Action dai secrets DB_NAME, DB_USER, DB_PASSWORD, SETUP_TOKEN.
if (!defined('ELECTROLAB_API')) { http_response_code(404); exit; }
return [
    'dsn' => 'mysql:host=localhost;dbname=my_nomesito;charset=utf8mb4',
    'user' => 'nomesito',
    'password' => '',
    // Codice da inserire una sola volta per creare l'amministratore (vuoto = disattivato)
    'setup_token' => '',
];
