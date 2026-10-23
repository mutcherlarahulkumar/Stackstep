import 'package:flutter/material.dart';
import 'package:shadcn_ui/shadcn_ui.dart';

/// Three rising steps: the Stackstep mark, drawn so it needs no image asset.
class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 40});

  final double size;

  @override
  Widget build(BuildContext context) {
    final c = ShadTheme.of(context).colorScheme;
    final step = size / 4.2;
    return Semantics(
      label: 'Stackstep',
      child: Container(
        width: size,
        height: size,
        padding: EdgeInsets.all(size * 0.18),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [c.primary, Color.lerp(c.primary, const Color(0xFFF59E0B), 0.3)!],
          ),
          borderRadius: BorderRadius.circular(size * 0.28),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            for (final h in [0.35, 0.65, 1.0])
              Container(
                width: step * 0.78,
                height: (size * 0.64) * h,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.55 + h * 0.45),
                  borderRadius: BorderRadius.circular(step * 0.2),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
