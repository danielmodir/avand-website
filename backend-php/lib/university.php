<?php
declare(strict_types=1);

/* University records are private and independent of the general sync document.
 * Activity links point at existing planning rows in that document. */
const TJ_UNIVERSITY_KINDS = ['dossiers', 'terms', 'courses', 'transfers', 'activities', 'resources'];
const TJ_UNIVERSITY_ACTIVITIES = ['class', 'exam', 'assignment'];
const TJ_UNIVERSITY_RULES = [
    'failed' => ['include', 'exclude'],
    'withdrawn' => ['include', 'exclude'],
    'repeated' => ['all', 'latest', 'highest'],
    'equivalent' => ['include', 'exclude'],
];

function tj_university_invalid(string $field): void {
    tj_fail(400, 'validation_error', ['field' => $field]);
}

function tj_university_text($value, string $field, int $limit, bool $required = false): string {
    if (!is_string($value) || mb_strlen($value) > $limit || ($required && trim($value) === '')) {
        tj_university_invalid($field);
    }
    return trim($value);
}

function tj_university_id($value, string $field): string {
    if (!is_string($value) || !preg_match('/^[A-Za-z0-9_-]{1,80}$/D', $value)) tj_university_invalid($field);
    return $value;
}

function tj_university_number($value, string $field, float $maximum, float $minimum = 0, bool $optional = false): ?float {
    if ($value === null && $optional) return null;
    if (!(is_int($value) || is_float($value)) || !is_finite($value) || $value < $minimum || $value > $maximum) {
        tj_university_invalid($field);
    }
    return round($value, 2, PHP_ROUND_HALF_UP);
}

function tj_university_choice($value, string $field, array $choices) {
    if (!in_array($value, $choices, true)) tj_university_invalid($field);
    return $value;
}

function tj_university_bool($value, string $field): bool {
    if (!is_bool($value)) tj_university_invalid($field);
    return $value;
}

function tj_university_date($value, string $field): ?string {
    if ($value === null || $value === '') return null;
    if (!is_string($value) || !preg_match('/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/D', $value, $parts)
        || !checkdate((int)$parts[2], (int)$parts[3], (int)$parts[1])) {
        tj_university_invalid($field);
    }
    return $value;
}

function tj_university_normalize(string $kind, array $body): array {
    $fields = [
        'dossiers' => ['university'=>160, 'degree'=>100, 'field'=>120, 'specialization'=>120, 'status'=>40],
        'terms' => ['title'=>160, 'academicYear'=>40, 'semester'=>40, 'status'=>40],
        'courses' => ['title'=>160, 'courseKey'=>100, 'unitType'=>80, 'instructor'=>160, 'notes'=>4000],
        'transfers' => ['notes'=>4000],
        'activities' => [],
        'resources' => ['title'=>160, 'notes'=>4000],
    ];
    $required = ['dossiers'=>'university', 'terms'=>'title', 'courses'=>'title', 'resources'=>'title'];
    $row = ['id'=>strtolower(tj_university_id($body['id'] ?? null, 'id'))];
    foreach ($fields[$kind] as $field => $limit) {
        $value = array_key_exists($field, $body) ? $body[$field] : '';
        if ($field === 'semester' && is_int($value) && $value >= 0 && $value <= 9) $value = (string)$value;
        $row[$field] = tj_university_text($value, $field, $limit, $field === ($required[$kind] ?? null));
    }
    if ($kind === 'dossiers' || $kind === 'terms') {
        foreach (['startDate','endDate'] as $field) $row[$field] = tj_university_date($body[$field] ?? null, $field);
        if ($row['startDate'] && $row['endDate'] && $row['startDate'] > $row['endDate']) tj_university_invalid('endDate');
    }
    if ($kind === 'dossiers') {
        $rules = array_key_exists('gpaRules', $body) ? $body['gpaRules'] : [];
        $defaults = array_key_exists('planningDefaults', $body) ? $body['planningDefaults'] : [];
        if (!is_array($rules) || ($rules && $rules === array_values($rules))) tj_university_invalid('gpaRules');
        if (!is_array($defaults) || ($defaults && $defaults === array_values($defaults))) tj_university_invalid('planningDefaults');
        foreach (TJ_UNIVERSITY_RULES as $field => $choices) {
            $row['gpaRules'][$field] = tj_university_choice($rules[$field] ?? null, $field, [null, ...$choices]);
        }
        $row['gpaRules']['passMark'] = tj_university_number($rules['passMark'] ?? null, 'passMark', 20, 0, true);
        foreach (TJ_UNIVERSITY_ACTIVITIES as $field) {
            $row['planningDefaults'][$field] = tj_university_bool(array_key_exists($field, $defaults) ? $defaults[$field] : false, $field);
        }
        $row['active'] = tj_university_bool(array_key_exists('active', $body) ? $body['active'] : false, 'active');
    }
    $parents = [
        'terms'=>['dossierId'], 'courses'=>['termId'], 'transfers'=>['sourceCourseId', 'targetCourseId'],
        'activities'=>['courseId'], 'resources'=>['courseId'],
    ];
    foreach ($parents[$kind] ?? [] as $field) $row[$field] = strtolower(tj_university_id($body[$field] ?? null, $field));
    if ($kind === 'courses') {
        $row['credits'] = tj_university_number($body['credits'] ?? null, 'credits', 100, 0.01);
        $row['grade'] = tj_university_number($body['grade'] ?? null, 'grade', 20, 0, true);
        $row['status'] = tj_university_choice(array_key_exists('status', $body) ? $body['status'] : 'ongoing', 'status',
            ['ongoing','passed','failed','withdrawn','equivalent']);
    }
    if ($kind === 'transfers') {
        $row['status'] = tj_university_choice(array_key_exists('status', $body) ? $body['status'] : 'pending', 'status',
            ['pending','approved','rejected']);
        $row['acceptedCredits'] = tj_university_number($body['acceptedCredits'] ?? null, 'acceptedCredits', 100, 0, true);
        $row['grade'] = tj_university_number($body['grade'] ?? null, 'grade', 20, 0, true);
    }
    if ($kind === 'activities') {
        $row['itemId'] = tj_university_id($body['itemId'] ?? null, 'itemId');
        $row['type'] = tj_university_choice($body['type'] ?? null, 'type', TJ_UNIVERSITY_ACTIVITIES);
        if (array_key_exists('showInPlanning', $body)) $row['showInPlanning'] = tj_university_bool($body['showInPlanning'], 'showInPlanning');
    }
    if ($kind === 'resources') {
        $row['type'] = tj_university_choice(array_key_exists('type', $body) ? $body['type'] : 'note', 'type', ['link','book','note']);
        $row['url'] = tj_university_text(array_key_exists('url', $body) ? $body['url'] : '', 'url', 2048);
        if ($row['url'] !== '') {
            $url = parse_url($row['url']);
            if (!preg_match('~^https?://[^\s\\\\]+$~iD', $row['url']) || !($url['host'] ?? '')) tj_university_invalid('url');
        } elseif ($row['type'] === 'link') {
            tj_university_invalid('url');
        }
    }
    return $row;
}

function tj_university_rows(PDO $db, int $uid): array {
    $state = array_fill_keys(TJ_UNIVERSITY_KINDS, []);
    $q = $db->prepare('SELECT kind, client_id, data FROM tj_university_records WHERE user_id=? ORDER BY id');
    $q->execute([$uid]);
    foreach ($q as $row) {
        $state[$row['kind']][$row['client_id']] = json_decode($row['data'], true, 512, JSON_THROW_ON_ERROR);
    }
    return $state;
}

function tj_university_lookup(array $state, string $kind, string $id): array {
    if (!isset($state[$kind][$id])) tj_fail(404, 'not_found');
    return $state[$kind][$id];
}

function tj_university_prepare(string $kind, array $row, array $state): array {
    $old = $state[$kind][$row['id']] ?? null;
    $parents = [
        'terms'=>['dossierId'], 'courses'=>['termId'], 'activities'=>['courseId','itemId','type'],
        'resources'=>['courseId'], 'transfers'=>['sourceCourseId','targetCourseId'],
    ];
    foreach ($parents[$kind] ?? [] as $field) {
        if ($old && $old[$field] !== $row[$field]) tj_fail(409, 'conflict', ['field'=>$field]);
    }

    if ($kind === 'terms') tj_university_lookup($state, 'dossiers', $row['dossierId']);
    if ($kind === 'courses') {
        tj_university_lookup($state, 'terms', $row['termId']);
        foreach ($state['transfers'] as $link) {
            if ($link['targetCourseId'] === $row['id'] && $link['status'] === 'approved'
                && ($row['status'] !== 'equivalent' || $row['credits'] < $link['acceptedCredits'])) tj_fail(409, 'conflict');
        }
    }
    if ($kind === 'activities' || $kind === 'resources') $course = tj_university_lookup($state, 'courses', $row['courseId']);
    if ($kind === 'activities') {
        foreach ($state['activities'] as $link) {
            if ($link['id'] !== $row['id'] && $link['itemId'] === $row['itemId']
                && ($link['type'] === 'assignment') === ($row['type'] === 'assignment')) tj_fail(409, 'conflict');
        }
        $term = tj_university_lookup($state, 'terms', $course['termId']);
        $dossier = tj_university_lookup($state, 'dossiers', $term['dossierId']);
        $row['showInPlanning'] = $row['showInPlanning'] ?? $old['showInPlanning'] ?? $dossier['planningDefaults'][$row['type']];
    }
    if ($kind === 'transfers') {
        $source = tj_university_lookup($state, 'courses', $row['sourceCourseId']);
        $target = tj_university_lookup($state, 'courses', $row['targetCourseId']);
        $sourceDossier = tj_university_lookup($state, 'terms', $source['termId'])['dossierId'];
        $targetDossier = tj_university_lookup($state, 'terms', $target['termId'])['dossierId'];
        if ($sourceDossier === $targetDossier) tj_university_invalid('targetCourseId');
        $row['sourceDossierId'] = $sourceDossier;
        $row['targetDossierId'] = $targetDossier;
        $row['sourceCredits'] = $old ? $old['sourceCredits'] : $source['credits'];
        $row['sourceGrade'] = $old ? $old['sourceGrade'] : $source['grade'];
        $row['sourceTitle'] = $old ? $old['sourceTitle'] : $source['title'];
        if ($row['status'] === 'approved') {
            if ($target['status'] !== 'equivalent') tj_university_invalid('targetCourseId');
            if (!$row['acceptedCredits'] || $row['acceptedCredits'] > $target['credits']) tj_university_invalid('acceptedCredits');
            foreach ($state['transfers'] as $link) {
                if ($link['id'] === $row['id'] || $link['status'] !== 'approved') continue;
                if ($link['targetCourseId'] === $target['id']
                    || ($link['sourceCourseId'] === $source['id'] && $link['targetDossierId'] === $targetDossier)) {
                    tj_fail(409, 'conflict');
                }
            }
        }
    }
    return $row;
}

function tj_university_hundredths(float $value): int {
    return (int)round($value * 100);
}

function tj_university_metrics(array $courses, array $rules, array $approved): array {
    $buckets = []; $passed = []; $missing = []; $total = 0;
    foreach ($courses as $course) {
        $status = $course['status'];
        $grade = $course['grade'];
        $credits = tj_university_hundredths($course['credits']);
        $equivalent = $status === 'equivalent';
        if ($equivalent) {
            $transfer = $approved[$course['id']] ?? null;
            if (!$transfer) continue;
            $credits = tj_university_hundredths($transfer['acceptedCredits']);
            $grade = $transfer['grade'];
        }
        $total += $credits;
        $key = $course['courseKey'] !== '' ? 'key:' . mb_strtolower($course['courseKey']) : 'id:' . $course['id'];
        if ($status === 'ongoing' && $grade !== null && $rules['passMark'] !== null) {
            $status = $grade >= $rules['passMark'] ? 'passed' : 'failed';
        }
        if ($status === 'passed' || $equivalent) {
            // An earned local attempt takes precedence for the equivalent subtotal.
            $current = $passed[$key] ?? null;
            if (!$current || ($current['equivalent'] && !$equivalent)
                || ($current['equivalent'] === $equivalent && $credits > $current['credits'])) {
                $passed[$key] = ['equivalent'=>$equivalent, 'credits'=>$credits];
            }
        }
        if ($grade !== null) $buckets[$key][] = [$status, tj_university_hundredths($grade), $credits];
    }
    $numerator = 0; $graded = 0;
    foreach ($buckets as $attempts) {
        $eligible = [];
        foreach ($attempts as $attempt) {
            [$status] = $attempt;
            if ($status === 'ongoing') $missing['passMark'] = true;
            if (in_array($status, ['failed','withdrawn','equivalent'], true)) {
                if ($rules[$status] === null) $missing[$status] = true;
                if ($rules[$status] === 'exclude') continue;
            }
            $eligible[] = $attempt;
        }
        if (count($eligible) > 1) {
            if ($rules['repeated'] === null) $missing['repeated'] = true;
            if ($rules['repeated'] === 'latest') $eligible = array_slice($eligible, -1);
            if ($rules['repeated'] === 'highest') {
                $highest = $eligible[0];
                foreach ($eligible as $attempt) if ($attempt[1] >= $highest[1]) $highest = $attempt;
                $eligible = [$highest];
            }
        }
        foreach ($eligible as [, $grade, $credits]) {
            $numerator += $grade * $credits;
            $graded += $credits;
        }
    }
    $earned = 0; $equivalentCredits = 0;
    foreach ($passed as $result) {
        $earned += $result['credits'];
        if ($result['equivalent']) $equivalentCredits += $result['credits'];
    }
    $missingRules = array_keys($missing);
    sort($missingRules);
    return [
        'gpa'=>$missing || !$graded ? null : intdiv($numerator * 2 + $graded, 2 * $graded) / 100,
        'gradedCredits'=>$missing ? null : $graded / 100,
        'passedCredits'=>$earned / 100,
        'equivalentCredits'=>$equivalentCredits / 100,
        'totalCredits'=>$total / 100,
        'missingRules'=>$missingRules,
    ];
}

function tj_university_transcripts(array $state): array {
    $approved = []; $termsByDossier = []; $coursesByTerm = []; $summaries = [];
    foreach ($state['transfers'] as $row) {
        if ($row['status'] === 'approved') $approved[$row['targetCourseId']] = $row;
    }
    foreach ($state['terms'] as $term) $termsByDossier[$term['dossierId']][] = $term;
    foreach ($state['courses'] as $course) $coursesByTerm[$course['termId']][] = $course;
    foreach ($state['dossiers'] as $dossier) {
        $terms = $termsByDossier[$dossier['id']] ?? [];
        usort($terms, static fn($a, $b) => ($a['startDate'] ?? '') <=> ($b['startDate'] ?? ''));
        $termMetrics = []; $allCourses = [];
        foreach ($terms as $term) {
            $courses = $coursesByTerm[$term['id']] ?? [];
            foreach ($courses as $course) $allCourses[] = $course;
            $termMetrics[] = ['termId'=>$term['id']] + tj_university_metrics($courses, $dossier['gpaRules'], $approved);
        }
        $summaries[] = ['dossierId'=>$dossier['id'], 'terms'=>$termMetrics, 'courses'=>$allCourses]
            + tj_university_metrics($allCourses, $dossier['gpaRules'], $approved);
    }
    return $summaries;
}

function tj_university_state(): void {
    $me = tj_require_user();
    $state = tj_university_rows(tj_db(), (int)$me['id']);
    tj_json(array_map('array_values', $state) + ['transcripts'=>tj_university_transcripts($state)]);
}

function tj_university_store(PDO $db, int $uid, string $kind, array $row, bool $existing): void {
    $data = json_encode($row, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    $sql = $existing ? 'UPDATE tj_university_records SET data=? WHERE user_id=? AND kind=? AND client_id=?'
        : 'INSERT INTO tj_university_records (data,user_id,kind,client_id) VALUES (?,?,?,?)';
    $db->prepare($sql)->execute([$data, $uid, $kind, $row['id']]);
}

function tj_university_save(string $kind): void {
    $me = tj_require_user();
    $uid = (int)$me['id'];
    $row = tj_university_normalize($kind, tj_body());
    $db = tj_db();
    tj_tx_begin($db);
    try {
        if (tj_driver() === 'mysql') {
            $db->prepare('SELECT id FROM tj_users WHERE id=? FOR UPDATE')->execute([$uid]);
        }
        $state = tj_university_rows($db, $uid);
        $row = tj_university_prepare($kind, $row, $state);
        if ($kind === 'activities') {
            $section = $row['type'] === 'assignment' ? 'tasks' : 'events';
            $q = $db->prepare('SELECT data FROM tj_user_data WHERE user_id=?');
            $q->execute([$uid]);
            $sync = json_decode((string)$q->fetchColumn(), true);
            $owned = false;
            foreach ($sync[$section] ?? [] as $item) {
                if (is_array($item) && ($item['id'] ?? null) === $row['itemId']) { $owned = true; break; }
            }
            if (!$owned) tj_fail(404, 'not_found');
        }
        if ($kind === 'dossiers' && $row['active']) {
            foreach ($state[$kind] as $old) {
                if ($old['id'] === $row['id'] || !$old['active']) continue;
                $old['active'] = false;
                tj_university_store($db, $uid, $kind, $old, true);
            }
        }
        tj_university_store($db, $uid, $kind, $row, isset($state[$kind][$row['id']]));
        tj_tx_commit($db);
    } catch (Throwable $error) {
        tj_tx_rollback($db);
        throw $error;
    }
    tj_json($row);
}
