import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:stackstep/api/models.dart';
import 'package:stackstep/core/providers.dart';
import 'package:stackstep/core/theme.dart';
import 'package:stackstep/shared/errors.dart';
import 'package:stackstep/shared/motion.dart';
import 'package:stackstep/shared/state_views.dart';

final FutureProvider<Attendance> attendanceProvider = FutureProvider.autoDispose<Attendance>(
  (ref) => ref.read(apiClientProvider).myAttendance(),
);

const _present = Color(0xFF16A34A);
const _missed = Color(0xFF78716C);

/// The student's attendance: totals, a forest to turn around, and the days as seats.
class AttendanceScreen extends ConsumerWidget {
  const AttendanceScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final a = ref.watch(attendanceProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Your attendance')),
      body: FadeSwitch(
        child: switch (a) {
          AsyncData(:final value) when value.days.isEmpty => const EmptyState(
            icon: LucideIcons.treePine,
            title: 'Your forest starts on Day 1',
            body: 'Come back tomorrow. Opening Stackstep plants your first tree.',
          ),
          AsyncData(:final value) => RefreshIndicator(
            onRefresh: () => ref.refresh(attendanceProvider.future),
            child: _Body(a: value),
          ),
          AsyncError(:final error) => ErrorState(message: messageFor(error), onRetry: () => ref.invalidate(attendanceProvider)),
          _ => const SkeletonList(rows: 3, height: 120),
        },
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.a});
  final Attendance a;

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    Widget stat(String label, String value, Color color) => Expanded(
      child: ShadCard(
        padding: const EdgeInsets.all(Space.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: t.textTheme.muted.copyWith(fontSize: 11)),
            Text(value, style: t.textTheme.h4.copyWith(color: color)),
          ],
        ),
      ),
    );
    return ListView(
      padding: const EdgeInsets.all(Space.lg),
      children: [
        Text(
          'Open Stackstep on a day and you are marked present, with your seat in the order you arrived. Every day present grows a tree.',
          style: t.textTheme.muted,
        ),
        const SizedBox(height: Space.md),
        Row(
          key: const Key('attendance-stats'),
          children: [
            stat('Present', '${a.present}', _present),
            const SizedBox(width: Space.sm),
            stat('Missed', '${a.missed}', _missed),
            const SizedBox(width: Space.sm),
            stat('Streak', '${a.streak}', const Color(0xFFD97706)),
          ],
        ),
        const SizedBox(height: Space.md),
        Forest(attendance: a),
        const SizedBox(height: Space.lg),
        Semantics(
          header: true,
          child: Text('Day by day', style: t.textTheme.small.copyWith(fontWeight: FontWeight.w600)),
        ),
        const SizedBox(height: Space.sm),
        Seats(attendance: a),
      ],
    );
  }
}

/// The days as cinema seats: a computer and seat number when present, a bare tree when missed.
class Seats extends StatelessWidget {
  const Seats({required this.attendance, super.key});
  final Attendance attendance;

  @override
  Widget build(BuildContext context) {
    final t = ShadTheme.of(context);
    return Wrap(
      key: const Key('attendance-seats'),
      spacing: 6,
      runSpacing: 10,
      children: [
        for (final d in attendance.days)
          Semantics(
            container: true,
            label: switch (d.status) {
              AttendanceStatus.present => 'Day ${d.day}, present, seat ${d.seat ?? ''}',
              AttendanceStatus.missed => 'Day ${d.day}, missed',
              AttendanceStatus.pending => 'Day ${d.day}, today, not opened yet',
            },
            child: ExcludeSemantics(
              child: Container(
                width: 42,
                height: 46,
                decoration: BoxDecoration(
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(10), bottom: Radius.circular(3)),
                  color: switch (d.status) {
                    AttendanceStatus.present => _present.withValues(alpha: 0.12),
                    AttendanceStatus.missed => _missed.withValues(alpha: 0.1),
                    AttendanceStatus.pending => Colors.transparent,
                  },
                  border: Border.all(color: d.status == AttendanceStatus.pending ? t.colorScheme.primary : t.colorScheme.border),
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    switch (d.status) {
                      AttendanceStatus.present => const Icon(LucideIcons.monitor, size: 16, color: _present),
                      AttendanceStatus.missed => const SizedBox(width: 18, height: 18, child: CustomPaint(painter: _DeadTreePainter())),
                      AttendanceStatus.pending => Icon(LucideIcons.sprout, size: 16, color: t.colorScheme.primary),
                    },
                    Text(
                      d.status == AttendanceStatus.present ? '#${d.seat ?? ''}' : 'D${d.day}',
                      style: t.textTheme.muted.copyWith(fontSize: 9, fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _DeadTreePainter extends CustomPainter {
  const _DeadTreePainter();

  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()
      ..color = _missed
      ..strokeWidth = 1.6
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;
    final w = size.width;
    final h = size.height;
    canvas
      ..drawLine(Offset(w / 2, h), Offset(w / 2, h * 0.4), p)
      ..drawLine(Offset(w / 2, h * 0.65), Offset(w * 0.2, h * 0.35), p)
      ..drawLine(Offset(w / 2, h * 0.55), Offset(w * 0.8, h * 0.25), p)
      ..drawLine(Offset(w / 2, h * 0.45), Offset(w * 0.45, h * 0.1), p);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// An isometric forest drawn in 3D: a green tree per day present, a bare one per day missed,
/// a sapling for today. Drag sideways to turn it.
class Forest extends StatefulWidget {
  const Forest({required this.attendance, super.key});
  final Attendance attendance;

  @override
  State<Forest> createState() => _ForestState();
}

class _ForestState extends State<Forest> {
  double _angle = -math.pi / 4;

  @override
  Widget build(BuildContext context) {
    final a = widget.attendance;
    return Semantics(
      label: 'A forest of ${a.present} green trees for days present and ${a.missed} bare trees for days missed',
      child: GestureDetector(
        onHorizontalDragUpdate: (d) => setState(() => _angle += d.delta.dx * 0.01),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(18),
          child: Container(
            key: const Key('attendance-forest'),
            height: 300,
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Color(0xFFBAE6FD), Color(0xFFECFDF5)],
              ),
            ),
            child: CustomPaint(painter: _ForestPainter(a.days, _angle), size: Size.infinite),
          ),
        ),
      ),
    );
  }
}

class _ForestPainter extends CustomPainter {
  _ForestPainter(this.days, this.angle);
  final List<AttendanceDay> days;
  final double angle;

  @override
  void paint(Canvas canvas, Size size) {
    final cols = math.max(2, math.sqrt(days.length).ceil());
    final rows = math.max(1, (days.length / cols).ceil());
    final span = math.max(cols, rows).toDouble();
    final tile = math.min(size.width, size.height * 1.6) / (span * 1.6);
    final center = Offset(size.width / 2, size.height * 0.58);
    // Ground coordinates, centred, rotated by the angle, then squashed for the isometric tilt.
    Offset project(double x, double y, [double z = 0]) {
      final gx = (x - cols / 2) * tile;
      final gy = (y - rows / 2) * tile;
      final rx = gx * math.cos(angle) - gy * math.sin(angle);
      final ry = gx * math.sin(angle) + gy * math.cos(angle);
      return center + Offset(rx, ry * 0.5 - z);
    }

    Path quad(double x, double y, double inset) => Path()
      ..moveTo(project(x + inset, y + inset).dx, project(x + inset, y + inset).dy)
      ..lineTo(project(x + 1 - inset, y + inset).dx, project(x + 1 - inset, y + inset).dy)
      ..lineTo(project(x + 1 - inset, y + 1 - inset).dx, project(x + 1 - inset, y + 1 - inset).dy)
      ..lineTo(project(x + inset, y + 1 - inset).dx, project(x + inset, y + 1 - inset).dy)
      ..close();

    // The island: a dark rim under a grass top.
    final rim = Path()
      ..moveTo(project(0, 0).dx, project(0, 0).dy + 10)
      ..lineTo(project(cols.toDouble(), 0).dx, project(cols.toDouble(), 0).dy + 10)
      ..lineTo(project(cols.toDouble(), rows.toDouble()).dx, project(cols.toDouble(), rows.toDouble()).dy + 10)
      ..lineTo(project(0, rows.toDouble()).dx, project(0, rows.toDouble()).dy + 10)
      ..close();
    canvas.drawPath(rim, Paint()..color = const Color(0xFF8B5A3C));
    final top = Path()
      ..moveTo(project(0, 0).dx, project(0, 0).dy)
      ..lineTo(project(cols.toDouble(), 0).dx, project(cols.toDouble(), 0).dy)
      ..lineTo(project(cols.toDouble(), rows.toDouble()).dx, project(cols.toDouble(), rows.toDouble()).dy)
      ..lineTo(project(0, rows.toDouble()).dx, project(0, rows.toDouble()).dy)
      ..close();
    canvas.drawPath(top, Paint()..color = const Color(0xFF6AA84F));

    final cells = [for (var i = 0; i < days.length; i++) (day: days[i], x: (i % cols).toDouble(), y: (i ~/ cols).toDouble())];
    for (final c in cells) {
      canvas.drawPath(
        quad(c.x, c.y, 0.06),
        Paint()..color = c.day.status == AttendanceStatus.missed ? const Color(0xFFB9A27F) : const Color(0xFF7CC35B),
      );
    }
    // Trees back to front, so nearer ones overlap farther ones.
    cells.sort((p, q) => project(p.x + 0.5, p.y + 0.5).dy.compareTo(project(q.x + 0.5, q.y + 0.5).dy));
    for (final c in cells) {
      final base = project(c.x + 0.5, c.y + 0.5);
      final s = tile / 64;
      switch (c.day.status) {
        case AttendanceStatus.present:
          final hue = 100.0 + (c.day.day * 37) % 40;
          canvas
            ..drawOval(Rect.fromCenter(center: base + Offset(0, 2 * s), width: 30 * s, height: 10 * s), Paint()..color = Colors.black26)
            ..drawRect(Rect.fromLTWH(base.dx - 3 * s, base.dy - 22 * s, 6 * s, 22 * s), Paint()..color = const Color(0xFF7C4A2A))
            ..drawCircle(base + Offset(0, -34 * s), 17 * s, Paint()..color = HSLColor.fromAHSL(1, hue, 0.55, 0.36).toColor())
            ..drawCircle(base + Offset(-7 * s, -40 * s), 11 * s, Paint()..color = HSLColor.fromAHSL(1, hue, 0.6, 0.45).toColor())
            ..drawCircle(base + Offset(7 * s, -46 * s), 10 * s, Paint()..color = HSLColor.fromAHSL(1, hue, 0.65, 0.52).toColor());
        case AttendanceStatus.missed:
          final p = Paint()
            ..color = const Color(0xFF6B5A4C)
            ..strokeCap = StrokeCap.round
            ..style = PaintingStyle.stroke;
          canvas
            ..drawLine(base, base + Offset(0, -40 * s), p..strokeWidth = 4 * s)
            ..drawLine(base + Offset(0, -18 * s), base + Offset(-12 * s, -32 * s), p..strokeWidth = 2.5 * s)
            ..drawLine(base + Offset(0, -24 * s), base + Offset(11 * s, -40 * s), p)
            ..drawLine(base + Offset(0, -34 * s), base + Offset(-4 * s, -48 * s), p..strokeWidth = 2 * s);
        case AttendanceStatus.pending:
          canvas
            ..drawLine(
              base,
              base + Offset(0, -14 * s),
              Paint()
                ..color = const Color(0xFF5B8C3A)
                ..strokeWidth = 2.5 * s,
            )
            ..drawOval(
              Rect.fromCenter(center: base + Offset(-5 * s, -14 * s), width: 10 * s, height: 6 * s),
              Paint()..color = const Color(0xFF7CC04A),
            )
            ..drawOval(
              Rect.fromCenter(center: base + Offset(5 * s, -16 * s), width: 10 * s, height: 6 * s),
              Paint()..color = const Color(0xFF7CC04A),
            );
      }
    }
  }

  @override
  bool shouldRepaint(covariant _ForestPainter old) => old.angle != angle || old.days != days;
}
