import 'package:flutter/material.dart';

/// The Stackstep mark: three rising steps on the brand gradient. Drawn from the same geometry
/// as the web icon (web/src/app/icon.svg) and the app icon (tool/brand_icons.py).
class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 40});

  final double size;

  static const gradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF7008E7), Color(0xFFA64BC0)],
  );

  @override
  Widget build(BuildContext context) => Semantics(
    label: 'Stackstep',
    child: SizedBox.square(
      dimension: size,
      child: const CustomPaint(painter: _MarkPainter()),
    ),
  );
}

class _MarkPainter extends CustomPainter {
  const _MarkPainter();

  // x, top, width, bottom, white opacity; in the icon's 32-unit space.
  static const _bars = [(6.5, 18.5, 4.5, 25.5, 0.70), (13.75, 13.0, 4.5, 25.5, 0.85), (21.0, 6.5, 4.5, 25.5, 1.0)];

  @override
  void paint(Canvas canvas, Size size) {
    final u = size.width / 32;
    final rect = Offset.zero & size;
    canvas.drawRRect(RRect.fromRectAndRadius(rect, Radius.circular(9 * u)), Paint()..shader = BrandMark.gradient.createShader(rect));
    for (final (x, top, w, bottom, alpha) in _bars) {
      canvas.drawRRect(
        RRect.fromLTRBR(x * u, top * u, (x + w) * u, bottom * u, Radius.circular(u)),
        Paint()..color = Colors.white.withValues(alpha: alpha),
      );
    }
  }

  @override
  bool shouldRepaint(_MarkPainter oldDelegate) => false;
}
