<?php
/* Account emails, sent with the host's own mail() from support@toojibee.ir
 * (the mailbox made in cPanel): a one-time code to confirm the email after
 * sign-up, and one to choose a new password. Both languages in one email,
 * plain text plus a simple HTML version (inline styles only — email apps
 * ignore stylesheets; the colors are the site's palette, tokens.css). In
 * tests send_mail=false writes them to a file instead. */
declare(strict_types=1);

function tj_mail(string $to, string $subject, string $text, string $html = ''): void {
    $cfg = tj_config();
    if (empty($cfg['send_mail'])) {
        if (!empty($cfg['mail_log'])) @file_put_contents($cfg['mail_log'], "To: $to\nSubject: $subject\n\n$text\n----\n", FILE_APPEND);
        return;
    }
    $from = $cfg['mail_from'];
    $envelope = preg_match('/<([^>]+)>/', $from, $m) ? $m[1] : $from;
    $name = trim(preg_replace('/<[^>]+>/', '', $from));
    $headers = [
        'From: ' . ($name !== '' ? '=?UTF-8?B?' . base64_encode($name) . "?= <$envelope>" : $envelope),
        'Reply-To: ' . $envelope,
        'MIME-Version: 1.0',
        'Auto-Submitted: auto-generated',
    ];
    if ($html === '') {
        $headers[] = 'Content-Type: text/plain; charset=UTF-8';
        $headers[] = 'Content-Transfer-Encoding: base64';
        $body = chunk_split(base64_encode($text));
    } else {
        $b = 'tj-' . bin2hex(random_bytes(8));
        $headers[] = "Content-Type: multipart/alternative; boundary=\"$b\"";
        $body = "--$b\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($text))
              . "--$b\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($html))
              . "--$b--\r\n";
    }
    if (!@mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $body, implode("\r\n", $headers), '-f' . $envelope)) {
        error_log('[toojibee-mail] mail() failed for a ' . substr($subject, 0, 20) . '… email');
    }
}

function tj_fa_digits(string $s): string {
    return strtr($s, ['0'=>'۰','1'=>'۱','2'=>'۲','3'=>'۳','4'=>'۴','5'=>'۵','6'=>'۶','7'=>'۷','8'=>'۸','9'=>'۹']);
}

/* One code email: a short Persian part, then English, the code big. */
function tj_code_email(string $to, string $subject, string $faLead, string $enLead, string $code): void {
    $faNote = 'این کد فقط یک بار و تا ۱۰ دقیقه کار می‌کنه. اگه درخواستش نکرده بودی، این ایمیل رو نادیده بگیر.';
    $enNote = 'It works once, for 10 minutes. If you didn\'t ask for it, ignore this email.';
    $text = "$faLead\n\n$code\n\n$faNote\n\n— — —\n\n$enLead\n\n$code\n\n$enNote\n\nToojibee · toojibee.ir\n";
    $h = function (string $s): string { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); };
    $codeBox = '<div style="font:700 34px/1.2 Tahoma,Arial,sans-serif;letter-spacing:10px;color:#2E2910;background:#EBE3A7;border-radius:14px;padding:16px 10px;text-align:center;direction:ltr;margin:18px 0">' . $h($code) . '</div>';
    $html = '<!doctype html><html><body style="margin:0;padding:24px 12px;background:#F7F3DA">'
        . '<div style="max-width:460px;margin:0 auto;background:#ffffff;border-radius:18px;padding:28px 24px;font:15px/1.8 Tahoma,Arial,sans-serif;color:#2E2910">'
        . '<div style="text-align:center;margin-bottom:8px"><span style="display:inline-block;width:52px;height:52px;line-height:52px;border-radius:50%;background:#2C5745;color:#EBE3A7;font:700 20px/52px Arial,sans-serif">Tj</span></div>'
        . '<div dir="rtl" style="text-align:right">' . '<p style="margin:0">' . $h($faLead) . '</p>' . $codeBox . '<p style="margin:0;font-size:13px;color:#6b6440">' . $h($faNote) . '</p></div>'
        . '<hr style="border:0;border-top:1px solid #EBE3A7;margin:22px 0">'
        . '<div dir="ltr" style="text-align:left"><p style="margin:0">' . $h($enLead) . '</p><p style="margin:10px 0 0;font-size:13px;color:#6b6440">' . $h($enNote) . '</p></div>'
        . '<p style="margin:22px 0 0;text-align:center;font-size:12px;color:#6b6440">توجیبی · Toojibee · <a href="https://toojibee.ir/" style="color:#EB7D00">toojibee.ir</a></p>'
        . '</div></body></html>';
    tj_mail($to, $subject, $text, $html);
}

function tj_send_verify_code(string $to, string $code): void {
    tj_code_email($to, 'کد تأیید ایمیل توجیبی · Toojibee email code',
        'سلام! برای تأیید ایمیلت این کد رو تو توجیبی وارد کن:',
        'Hi! Enter this code in Toojibee to confirm your email (the code is above too).', $code);
}

function tj_send_reset_code(string $to, string $code): void {
    tj_code_email($to, 'کد بازیابی رمز توجیبی · Toojibee password code',
        'سلام! برای انتخاب رمز جدید این کد رو تو توجیبی وارد کن:',
        'Hi! Enter this code in Toojibee to choose a new password (the code is above too).', $code);
}
