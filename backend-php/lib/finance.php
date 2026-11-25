<?php
declare(strict_types=1);

/* Private, owner-scoped ledger. Amounts are integer toman; no finance row
 * enters the general /sync document, and no group endpoint can read it. */

function tj_finance_text($value, int $max, bool $required = false): string {
    if (!is_string($value) || mb_strlen($value) > $max || ($required && trim($value) === '')) tj_fail(400, 'validation_error');
    return trim($value);
}

function tj_finance_id($value): int {
    if (!is_int($value) || $value < 1) tj_fail(400, 'validation_error');
    return $value;
}

function tj_finance_lock_user(PDO $db, int $uid): void {
    if (tj_driver() !== 'mysql') return; // SQLite BEGIN IMMEDIATE owns the write lock.
    $q = $db->prepare('SELECT id FROM tj_users WHERE id=? FOR UPDATE');
    $q->execute([$uid]);
}

function tj_finance_balance(PDO $db, int $uid, int $accountId): int {
    $q = $db->prepare('SELECT COALESCE(SUM(amount_toman),0) FROM tj_finance_entries WHERE user_id=? AND account_id=?');
    $q->execute([$uid, $accountId]);
    return (int)$q->fetchColumn();
}

function tj_finance_state(): void {
    $me = tj_require_user(); $db = tj_db(); $uid = (int)$me['id'];
    $q = $db->prepare('SELECT id,client_id,name,kind,color,icon,archived_at FROM tj_finance_accounts WHERE user_id=? ORDER BY id');
    $q->execute([$uid]); $accounts = [];
    foreach ($q->fetchAll() as $a) {
        $a['id'] = (int)$a['id']; $a['archived'] = $a['archived_at'] !== null;
        unset($a['archived_at']); $a['balance_toman'] = tj_finance_balance($db, $uid, $a['id']);
        $accounts[] = $a;
    }
    $q = $db->prepare('SELECT id,client_id,name,kind,parent_id,color,icon,archived_at FROM tj_finance_categories WHERE user_id=? ORDER BY id');
    $q->execute([$uid]); $categories = [];
    foreach ($q->fetchAll() as $c) {
        $c['id'] = (int)$c['id'];
        $c['parent_id'] = $c['parent_id'] === null ? null : (int)$c['parent_id'];
        $c['archived'] = $c['archived_at'] !== null;
        unset($c['archived_at']); $categories[] = $c;
    }
    $q = $db->prepare('SELECT id,request_id,kind,amount_toman,occurred_at,category_id,note,source_id
        FROM tj_finance_transactions WHERE user_id=? ORDER BY occurred_at DESC,id DESC LIMIT 100');
    $q->execute([$uid]); $transactions = [];
    $entries = $db->prepare('SELECT account_id,amount_toman FROM tj_finance_entries WHERE user_id=? AND transaction_id=? ORDER BY id');
    foreach ($q->fetchAll() as $t) {
        $t['id'] = (int)$t['id']; $t['amount_toman'] = (int)$t['amount_toman'];
        $t['category_id'] = $t['category_id'] === null ? null : (int)$t['category_id'];
        $t['occurred_at'] = str_replace(' ', 'T', $t['occurred_at']) . 'Z';
        $entries->execute([$uid, $t['id']]); $t['entries'] = [];
        foreach ($entries->fetchAll() as $entry) $t['entries'][] = [
            'account_id' => (int)$entry['account_id'], 'amount_toman' => (int)$entry['amount_toman']];
        $transactions[] = $t;
    }
    tj_json(['currency'=>'TOMAN',
        'wallet_balance_toman'=>array_sum(array_column($accounts, 'balance_toman')),
        'accounts'=>$accounts, 'categories'=>$categories, 'transactions'=>$transactions]);
}

function tj_finance_category_create(): void {
    $me = tj_require_user(); $b = tj_body(); $uid = (int)$me['id'];
    $clientId = tj_finance_text($b['client_id'] ?? null, 80, true);
    $name = tj_finance_text($b['name'] ?? null, 100, true);
    $kind = $b['kind'] ?? null;
    if (!in_array($kind,['income','expense'],true)) tj_fail(400,'validation_error');
    $parentId = isset($b['parent_id']) ? tj_finance_id($b['parent_id']) : null;
    $color = tj_finance_text($b['color'] ?? '',32);
    $icon = tj_finance_text($b['icon'] ?? '',40);
    $db = tj_db(); tj_tx_begin($db); tj_finance_lock_user($db,$uid);
    $q = $db->prepare('SELECT * FROM tj_finance_categories WHERE user_id=? AND client_id=?');
    $q->execute([$uid,$clientId]); $old = $q->fetch();
    if ($old) {
        if ([$old['name'],$old['kind'],$old['parent_id'] === null ? null : (int)$old['parent_id'],$old['color'],$old['icon']]
            !== [$name,$kind,$parentId,$color,$icon]) { tj_tx_rollback($db); tj_fail(409,'request_conflict'); }
        $id = (int)$old['id']; tj_tx_commit($db);
        tj_json(['id'=>$id,'client_id'=>$clientId,'name'=>$name,'kind'=>$kind,'parent_id'=>$parentId,
            'color'=>$color,'icon'=>$icon,'archived'=>$old['archived_at']!==null]);
    }
    if ($parentId !== null) {
        $q = $db->prepare('SELECT parent_id FROM tj_finance_categories WHERE user_id=? AND id=? AND kind=? AND archived_at IS NULL');
        $q->execute([$uid,$parentId,$kind]); $parent = $q->fetch();
        if (!$parent) { tj_tx_rollback($db); tj_fail(404,'category_not_found'); }
        if ($parent['parent_id'] !== null) { tj_tx_rollback($db); tj_fail(400,'category_depth'); }
    }
    $db->prepare('INSERT INTO tj_finance_categories (user_id,client_id,name,kind,parent_id,color,icon) VALUES (?,?,?,?,?,?,?)')
       ->execute([$uid,$clientId,$name,$kind,$parentId,$color,$icon]);
    $id = (int)$db->lastInsertId(); tj_tx_commit($db);
    tj_json(['id'=>$id,'client_id'=>$clientId,'name'=>$name,'kind'=>$kind,'parent_id'=>$parentId,
        'color'=>$color,'icon'=>$icon,'archived'=>false],201);
}

function tj_finance_account_create(): void {
    $me = tj_require_user(); $b = tj_body(); $uid = (int)$me['id'];
    $clientId = tj_finance_text($b['client_id'] ?? null, 80, true);
    $name = tj_finance_text($b['name'] ?? null, 100, true);
    $kind = $b['kind'] ?? null;
    if (!in_array($kind, ['bank','cash','savings','other'], true)) tj_fail(400, 'validation_error');
    $color = tj_finance_text($b['color'] ?? '', 32);
    $icon = tj_finance_text($b['icon'] ?? '', 40);
    $db = tj_db(); tj_tx_begin($db); tj_finance_lock_user($db, $uid);
    $q = $db->prepare('SELECT * FROM tj_finance_accounts WHERE user_id=? AND client_id=?');
    $q->execute([$uid,$clientId]); $old = $q->fetch();
    if ($old) {
        if ([$old['name'],$old['kind'],$old['color'],$old['icon']] !== [$name,$kind,$color,$icon]) {
            tj_tx_rollback($db); tj_fail(409,'request_conflict');
        }
        $id = (int)$old['id']; $balance = tj_finance_balance($db,$uid,$id);
        tj_tx_commit($db);
        tj_json(['id'=>$id,'client_id'=>$clientId,'name'=>$name,'kind'=>$kind,'color'=>$color,'icon'=>$icon,
            'archived'=>$old['archived_at']!==null,'balance_toman'=>$balance]);
    }
    $db->prepare('INSERT INTO tj_finance_accounts (user_id,client_id,name,kind,color,icon,created_at) VALUES (?,?,?,?,?,?,?)')
       ->execute([$uid,$clientId,$name,$kind,$color,$icon,tj_now()]);
    $id = (int)$db->lastInsertId(); tj_tx_commit($db);
    tj_json(['id'=>$id,'client_id'=>$clientId,'name'=>$name,'kind'=>$kind,'color'=>$color,'icon'=>$icon,
        'archived'=>false,'balance_toman'=>0], 201);
}

function tj_finance_transaction_create(): void {
    $me = tj_require_user(); $b = tj_body(); $uid = (int)$me['id'];
    $requestId = tj_finance_text($b['request_id'] ?? null, 80, true);
    $kind = $b['kind'] ?? null;
    if (!in_array($kind, ['opening','income','expense','transfer'], true)) tj_fail(400,'unsupported_kind');
    $amount = $b['amount_toman'] ?? null;
    if (!is_int($amount) || $amount < 1 || $amount > 9000000000000000) tj_fail(400,'invalid_amount');
    $accountId = tj_finance_id($b['account_id'] ?? null);
    $destinationId = isset($b['destination_id']) ? tj_finance_id($b['destination_id']) : null;
    if (($kind === 'transfer') !== ($destinationId !== null) || $destinationId === $accountId) tj_fail(400,'invalid_transfer');
    $categoryId = isset($b['category_id']) ? tj_finance_id($b['category_id']) : null;
    if ($categoryId !== null && !in_array($kind,['income','expense'],true)) tj_fail(400,'category_not_found');
    $note = tj_finance_text($b['note'] ?? '', 2000);
    $sourceId = tj_finance_text($b['source_id'] ?? '', 120);
    $rawDate = $b['occurred_at'] ?? null;
    if ($rawDate !== null && (!is_string($rawDate) ||
        !preg_match('/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/D', $rawDate))) tj_fail(400,'validation_error');
    try {
        $date = $rawDate === null ? tj_now() : (new DateTimeImmutable($rawDate))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
    } catch (Exception $e) { tj_fail(400,'validation_error'); }
    $hash = hash('sha256', json_encode([$kind,$amount,$accountId,$destinationId,$categoryId,$note,$sourceId,$rawDate], JSON_UNESCAPED_UNICODE));
    $db = tj_db(); tj_tx_begin($db); tj_finance_lock_user($db,$uid);
    $q = $db->prepare('SELECT id,payload_hash FROM tj_finance_transactions WHERE user_id=? AND request_id=?');
    $q->execute([$uid,$requestId]); $old = $q->fetch();
    if ($old) {
        tj_tx_commit($db);
        if (!hash_equals($old['payload_hash'],$hash)) tj_fail(409,'request_conflict');
        tj_json(['id'=>(int)$old['id'],'request_id'=>$requestId]);
    }
    $q = $db->prepare('SELECT id FROM tj_finance_accounts WHERE user_id=? AND id=? AND archived_at IS NULL');
    foreach ([$accountId,$destinationId] as $id) {
        if ($id === null) continue;
        $q->execute([$uid,$id]);
        if (!$q->fetch()) { tj_tx_rollback($db); tj_fail(404,'account_not_found'); }
    }
    $max = 9000000000000000;
    $delta = in_array($kind,['expense','transfer'],true) ? -$amount : $amount;
    if (abs(tj_finance_balance($db,$uid,$accountId) + $delta) > $max ||
        ($destinationId !== null && abs(tj_finance_balance($db,$uid,$destinationId) + $amount) > $max)) {
        tj_tx_rollback($db); tj_fail(400,'balance_limit');
    }
    $q = $db->prepare('SELECT COALESCE(SUM(amount_toman),0) FROM tj_finance_entries WHERE user_id=?');
    $q->execute([$uid]);
    if (abs((int)$q->fetchColumn() + ($kind === 'transfer' ? 0 : $delta)) > $max) {
        tj_tx_rollback($db); tj_fail(400,'balance_limit');
    }
    if ($categoryId !== null) {
        $q = $db->prepare('SELECT id FROM tj_finance_categories WHERE user_id=? AND id=? AND kind=? AND archived_at IS NULL');
        $q->execute([$uid,$categoryId,$kind]);
        if (!$q->fetch()) { tj_tx_rollback($db); tj_fail(404,'category_not_found'); }
    }
    $db->prepare('INSERT INTO tj_finance_transactions
        (user_id,request_id,payload_hash,kind,amount_toman,occurred_at,category_id,note,source_id,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)')
       ->execute([$uid,$requestId,$hash,$kind,$amount,$date,$categoryId,$note,$sourceId,tj_now()]);
    $txId = (int)$db->lastInsertId();
    $entry = $db->prepare('INSERT INTO tj_finance_entries (user_id,transaction_id,account_id,amount_toman) VALUES (?,?,?,?)');
    $entry->execute([$uid,$txId,$accountId,in_array($kind,['expense','transfer'],true) ? -$amount : $amount]);
    if ($destinationId !== null) $entry->execute([$uid,$txId,$destinationId,$amount]);
    tj_tx_commit($db); tj_json(['id'=>$txId,'request_id'=>$requestId],201);
}
