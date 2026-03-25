<?php
/**
 * api.php – server-side file operations for the PCB Panel Creator.
 *
 * Actions:
 *   POST /api.php?action=save          – save project JSON to saves/
 *   GET  /api.php?action=load&name=X   – load project JSON from saves/
 *   GET  /api.php?action=list          – list saved projects
 *   POST /api.php?action=delete&name=X – delete a saved project
 */

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

define('SAVES_DIR', __DIR__ . '/saves/');

$action = $_GET['action'] ?? $_POST['action'] ?? '';

switch ($action) {

  // ── Save project ────────────────────────────────────────────
  case 'save':
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') { err(405, 'POST required'); break; }

    $body = file_get_contents('php://input');
    if (!$body) { err(400, 'Empty body'); break; }

    $data = json_decode($body, true);
    if (!$data || ($data['format'] ?? '') !== 'pcbpanel') {
      err(400, 'Invalid pcbpanel JSON'); break;
    }

    $name     = preg_replace('/[^a-zA-Z0-9_\- ]/', '', $data['board']['name'] ?? 'board');
    $name     = trim($name) ?: 'board';
    $filename = SAVES_DIR . $name . '.pcbpanel';

    if (file_put_contents($filename, $body) === false) {
      err(500, 'Could not write file'); break;
    }

    echo json_encode(['ok' => true, 'name' => $name, 'file' => basename($filename)]);
    break;

  // ── Load project ────────────────────────────────────────────
  case 'load':
    $name = preg_replace('/[^a-zA-Z0-9_\- ]/', '', $_GET['name'] ?? '');
    if (!$name) { err(400, 'Missing name'); break; }

    $filename = SAVES_DIR . $name . '.pcbpanel';
    if (!is_file($filename)) { err(404, 'Not found'); break; }

    $content = file_get_contents($filename);
    if ($content === false) { err(500, 'Read error'); break; }

    header('Content-Type: application/json');
    echo $content;
    break;

  // ── List saved projects ─────────────────────────────────────
  case 'list':
    $files = glob(SAVES_DIR . '*.pcbpanel');
    $result = array_map(function($f) {
      $name  = basename($f, '.pcbpanel');
      $size  = filesize($f);
      $mtime = filemtime($f);
      return ['name' => $name, 'size' => $size, 'modified' => $mtime];
    }, $files ?: []);
    echo json_encode(['ok' => true, 'projects' => $result]);
    break;

  // ── Delete project ──────────────────────────────────────────
  case 'delete':
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') { err(405, 'POST required'); break; }

    $name = preg_replace('/[^a-zA-Z0-9_\- ]/', '', $_GET['name'] ?? $_POST['name'] ?? '');
    if (!$name) { err(400, 'Missing name'); break; }

    $filename = SAVES_DIR . $name . '.pcbpanel';
    if (!is_file($filename)) { err(404, 'Not found'); break; }
    if (!unlink($filename))  { err(500, 'Delete failed'); break; }

    echo json_encode(['ok' => true]);
    break;

  default:
    err(400, 'Unknown action');
}

function err($code, $msg) {
  http_response_code($code);
  echo json_encode(['ok' => false, 'error' => $msg]);
}
