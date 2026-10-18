<?php
/* Account emails (verify address, reset password), bilingual, plain
 * text, sent with the host's own mail() from no-reply@toojibee.ir.
 * Links open the app, which handles #verify-email= / #reset-password=
 * (Cloud.takeEmailLink in the app). In tests send_mail=false writes them
 * to a file instead. */
declare(strict_types=1);

function tj_mail(string $to, string $subject, string $body): void {
    $cfg = tj_config();
    if (empty($cfg['send_mail'])) {
        if (!empty($cfg['mail_log'])) @file_put_contents($cfg['mail_log'], "To: $to\nSubject: $subject\n\n$body\n----\n", FILE_APPEND);
        return;
    }
    $from = $cfg['mail_from'];
    $envelope = preg_match('/<([^>]+)>/', $from, $m) ? $m[1] : $from;
    $headers = implode("\r\n", [
        'From: ' . $from,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
    ]);
    @mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $body, $headers, '-f' . $envelope);
}

function tj_send_verify_email(string $to, string $token): void {
    $link = tj_config()['app_url'] . '#verify-email=' . rawurlencode($token);
    tj_mail($to, 'تأیید ایمیل توجیبی · Confirm your Toojibee email',
        "سلام!\nبرای تأیید ایمیلت روی این لینک بزن (تا ۷ روز معتبره):\n$link\n\n" .
        "Hi! Confirm your email with this link (valid for 7 days):\n$link\n\n" .
        "اگه تو حساب توجیبی نساختی، این پیام رو نادیده بگیر.\nIf you didn't sign up for Toojibee, ignore this message.\n");
}

function tj_send_reset_email(string $to, string $token): void {
    $link = tj_config()['app_url'] . '#reset-password=' . rawurlencode($token);
    tj_mail($to, 'بازیابی رمز توجیبی · Reset your Toojibee password',
        "سلام!\nبرای انتخاب رمز جدید روی این لینک بزن (تا ۱ ساعت معتبره):\n$link\n\n" .
        "Hi! Choose a new password with this link (valid for 1 hour):\n$link\n\n" .
        "اگه درخواست نکرده بودی، این پیام رو نادیده بگیر؛ رمزت عوض نمی‌شه.\nIf you didn't ask for this, ignore it — your password stays the same.\n");
}
