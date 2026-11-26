<?php
declare(strict_types=1);

// A grant is tied to one accepted friendship and its lifetime. Read only
// personal top-level tasks and never return the account sync document.
function tj_shared_task($doc, string $id) {
    foreach (($doc->tasks ?? []) as $t) {
        if (is_object($t) && ($t->id ?? null) === $id && empty($t->groupId)) return $t;
    }
    return null;
}

function tj_task_shares_list(): void {
    $me = tj_require_user();
    $db = tj_db();
    $q = $db->prepare("SELECT g.*, a.public_id AS owner, b.public_id AS recipient
        FROM tj_task_grants g JOIN tj_connections c ON c.id=g.connection_id
        JOIN tj_users a ON a.id=g.owner_id JOIN tj_users b ON b.id=g.recipient_id
        WHERE c.status='accepted' AND a.status='active' AND b.status='active'
        AND (g.owner_id=? OR g.recipient_id=?) ORDER BY g.owner_id, g.task_id");
    $q->execute([$me['id'], $me['id']]);
    $docs = $db->prepare('SELECT data,version FROM tj_user_data WHERE user_id=?');
    $out = []; $last = null;
    foreach ($q->fetchAll() as $g) {
        if ($last !== $g['owner_id']) {
            $last = $g['owner_id']; $docs->execute([$last]); $row = $docs->fetch();
            $doc = json_decode($row['data'] ?? '{}');
        }
        $t = tj_shared_task($doc, $g['task_id']);
        if ($t) $out[] = ['id'=>$g['id'], 'task_id'=>$g['task_id'], 'mine'=>(int)$g['owner_id']===(int)$me['id'],
            'owner'=>$g['owner'], 'recipient'=>$g['recipient'], 'role'=>$g['role'],
            'title'=>$t->title ?? '', 'description'=>$t->description ?? '', 'version'=>(int)$row['version']];
    }
    tj_json($out);
}

function tj_task_shares_save(): void {
    $me = tj_require_user(); $b = tj_body();
    $id = $b['task_id'] ?? null; $role = $b['role'] ?? null;
    if (!is_string($id) || !preg_match('/^[a-zA-Z0-9_-]{1,80}$/D', $id)
        || !in_array($role, ['viewer','editor'], true) || !is_string($b['recipient'] ?? null)) tj_fail(400, 'validation_error');
    $other = tj_social_other($me, $b['recipient']);
    $db = tj_db(); tj_tx_begin($db);
    $pair = tj_social_row((int)$me['id'], (int)$other['id']);
    $q = $db->prepare('SELECT data FROM tj_user_data WHERE user_id=?');
    $q->execute([$me['id']]);
    if (!$pair || $pair['status'] !== 'accepted' || !tj_shared_task(json_decode($q->fetchColumn() ?: '{}'), $id)) {
        tj_tx_rollback($db); tj_fail(404, 'not_found');
    }
    $q = $db->prepare('SELECT id FROM tj_task_grants WHERE owner_id=? AND recipient_id=? AND task_id=?');
    $q->execute([$me['id'], $other['id'], $id]);
    $key = $q->fetchColumn();
    if ($key) $db->prepare('UPDATE tj_task_grants SET role=? WHERE id=?')->execute([$role,$key]);
    else {
        $key = bin2hex(random_bytes(16));
        $db->prepare('INSERT INTO tj_task_grants (id,connection_id,owner_id,recipient_id,task_id,role) VALUES (?,?,?,?,?,?)')
           ->execute([$key,$pair['id'],$me['id'],$other['id'],$id,$role]);
    }
    tj_tx_commit($db); tj_json(['id'=>$key],201);
}

function tj_task_share_revoke(string $key): void {
    $me = tj_require_user();
    $q = tj_db()->prepare('DELETE FROM tj_task_grants WHERE id=? AND owner_id=?');
    $q->execute([$key,$me['id']]);
    if (!$q->rowCount()) tj_fail(404,'not_found');
    tj_json(null,204);
}

function tj_task_share_edit(string $key): void {
    $me = tj_require_user(); $b = tj_body();
    $title = $b['title'] ?? null;
    if (!is_string($title) || trim($title)==='' || mb_strlen($title)>300 || !is_int($b['version'] ?? null)
        || (array_key_exists('description',$b) && (!is_string($b['description']) || mb_strlen($b['description'])>4000))) tj_fail(400,'validation_error');
    $db = tj_db(); tj_tx_begin($db);
    $lock = tj_driver()==='mysql' ? ' FOR UPDATE' : '';
    $q = $db->prepare("SELECT g.* FROM tj_task_grants g JOIN tj_connections c ON c.id=g.connection_id
        JOIN tj_users u ON u.id=g.owner_id WHERE g.id=? AND g.recipient_id=? AND c.status='accepted' AND u.status='active'" . $lock);
    $q->execute([$key,$me['id']]); $grant = $q->fetch();
    if (!$grant) { tj_tx_rollback($db); tj_fail(404,'not_found'); }
    if ($grant['role'] !== 'editor') { tj_tx_rollback($db); tj_fail(403,'forbidden'); }
    $q = $db->prepare('SELECT data,version FROM tj_user_data WHERE user_id=?' . $lock);
    $q->execute([$grant['owner_id']]); $row = $q->fetch();
    $doc = json_decode($row['data'] ?? '{}');
    $t = tj_shared_task($doc,$grant['task_id']);
    if (!$t) { tj_tx_rollback($db); tj_fail(404,'not_found'); }
    if ((int)$row['version'] !== $b['version']) { tj_tx_rollback($db); tj_fail(409,'version_conflict'); }
    $t->title = trim($title);
    if (isset($b['description'])) $t->description = $b['description'];
    $json = json_encode($doc, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (strlen($json)>TJ_MAX_SYNC_BYTES) { tj_tx_rollback($db); tj_fail(413,'too_large'); }
    $db->prepare('UPDATE tj_user_data SET data=?,version=version+1,updated_at=? WHERE user_id=?')
       ->execute([$json,tj_now(),$grant['owner_id']]);
    tj_tx_commit($db); tj_json(['version'=>$b['version']+1]);
}
