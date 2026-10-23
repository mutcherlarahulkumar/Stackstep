import 'package:intl/intl.dart';
import 'package:stackstep/api/models.dart';

/// "Due in 3h", "Due tomorrow, 6:00 PM", "Overdue by 2d".
String dueLabel(DateTime due, DateTime now) {
  final d = due.toLocal();
  final n = now.toLocal();
  final diff = d.difference(n);
  if (diff.isNegative) {
    final late = -diff;
    if (late.inMinutes < 60) return 'Overdue by ${late.inMinutes.clamp(1, 59)}m';
    if (late.inHours < 24) return 'Overdue by ${late.inHours}h';
    return 'Overdue by ${late.inDays}d';
  }
  if (diff.inMinutes < 60) return 'Due in ${diff.inMinutes.clamp(1, 59)}m';
  if (diff.inHours < 12 && d.day == n.day) return 'Due in ${diff.inHours}h';
  final today = DateTime(n.year, n.month, n.day);
  final day = DateTime(d.year, d.month, d.day);
  final days = day.difference(today).inDays;
  final time = DateFormat.jm().format(d);
  if (days == 0) return 'Due today, $time';
  if (days == 1) return 'Due tomorrow, $time';
  if (days < 7) return 'Due ${DateFormat.EEEE().format(d)}, $time';
  return 'Due ${DateFormat.MMMd().format(d)}, $time';
}

bool isOverdue(DateTime due, DateTime now) => due.isBefore(now);

/// Chat day separators: "Today", "Yesterday", "Monday", "2 Nov".
String dayLabel(DateTime at, DateTime now) {
  final a = at.toLocal();
  final n = now.toLocal();
  final days = DateTime(n.year, n.month, n.day).difference(DateTime(a.year, a.month, a.day)).inDays;
  if (days == 0) return 'Today';
  if (days == 1) return 'Yesterday';
  if (days < 7) return DateFormat.EEEE().format(a);
  if (a.year == n.year) return DateFormat.MMMd().format(a);
  return DateFormat.yMMMd().format(a);
}

String timeLabel(DateTime at) => DateFormat.jm().format(at.toLocal());

String dateTimeLabel(DateTime at) => DateFormat('EEE d MMM, h:mm a').format(at.toLocal());

/// Inbox row times: "4:05 PM" today, then "Yesterday", "Mon", "2 Nov".
String inboxTimeLabel(DateTime at, DateTime now) {
  final a = at.toLocal();
  final n = now.toLocal();
  final days = DateTime(n.year, n.month, n.day).difference(DateTime(a.year, a.month, a.day)).inDays;
  if (days <= 0) return timeLabel(a);
  if (days == 1) return 'Yesterday';
  if (days < 7) return DateFormat.E().format(a);
  if (a.year == n.year) return DateFormat.MMMd().format(a);
  return DateFormat.yMMMd().format(a);
}

/// One line of a message for list previews.
String previewLine(String body, {int max = 90}) {
  final one = body.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).join(' ');
  final runes = one.runes;
  return runes.length <= max ? one : '${String.fromCharCodes(runes.take(max - 1))}…';
}

/// What a task card says about time: finished or cancelled tasks never show a due countdown.
String taskTimeLabel(Task t, DateTime now) => switch (t.status) {
  TaskStatus.done => 'Finished ${dateTimeLabel(t.updatedAt)}',
  TaskStatus.cancelled => 'Cancelled',
  _ => dueLabel(t.dueAt, now),
};
