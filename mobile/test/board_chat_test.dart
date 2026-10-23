import 'package:flutter_test/flutter_test.dart';
import 'package:stackstep/api/json.dart';
import 'package:stackstep/api/models.dart';
import 'package:stackstep/features/chat/chat_controller.dart';
import 'package:stackstep/features/tasks/board_controller.dart';
import 'package:stackstep/shared/format.dart';

import 'fixtures.dart';

Task task(String id, String status, String due) => Task.fromJson(JsonReader(taskJson(id: id, status: status, due: due)));
Message msg(String id, String at) => Message.fromJson(JsonReader(messageJson(id: id, sentAt: at)));

void main() {
  test('board groups by column, hides cancelled, sorts by due', () {
    final g = groupBoard([
      task('a', 'in_progress', '2026-11-05T00:00:00Z'),
      task('b', 'todo', '2026-11-04T00:00:00Z'),
      task('c', 'cancelled', '2026-11-04T00:00:00Z'),
      task('d', 'changes_requested', '2026-11-04T00:00:00Z'),
      task('e', 'done', '2026-11-04T00:00:00Z'),
      task('f', 'in_review', '2026-11-04T00:00:00Z'),
    ]);
    expect(g[BoardColumn.today]!.map((t) => t.id), ['b', 'a']);
    expect(g[BoardColumn.changes]!.single.id, 'd');
    expect(g[BoardColumn.inReview]!.single.id, 'f');
    expect(g[BoardColumn.done]!.map((t) => t.id), ['e']);
  });

  test('messages merge without duplicates, newest first', () {
    final a = [msg('2', '2026-11-04T10:00:00Z'), msg('1', '2026-11-04T09:00:00Z')];
    final b = [msg('3', '2026-11-04T11:00:00Z'), msg('2', '2026-11-04T10:00:00Z')];
    expect(mergeMessages(a, b).map((m) => m.id), ['3', '2', '1']);
  });

  test('chat items put outgoing newest at the top', () {
    final s = ChatState(
      delivered: [msg('1', '2026-11-04T09:00:00Z')],
      outgoing: [
        Outgoing(clientId: 'a', body: 'first', at: DateTime.utc(2026, 11, 4, 10)),
        Outgoing(clientId: 'b', body: 'second', at: DateTime.utc(2026, 11, 4, 10, 1)),
      ],
      nextCursor: null,
    );
    expect(s.items.map((i) => i.key), ['out-b', 'out-a', '1']);
  });

  test('due labels', () {
    final now = DateTime(2026, 11, 4, 10);
    expect(dueLabel(now.add(const Duration(minutes: 30)), now), 'Due in 30m');
    expect(dueLabel(now.subtract(const Duration(hours: 3)), now), 'Overdue by 3h');
    expect(dueLabel(DateTime(2026, 11, 5, 18), now), startsWith('Due tomorrow'));
  });
}
