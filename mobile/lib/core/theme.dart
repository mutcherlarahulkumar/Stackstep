import 'package:flutter/material.dart';
import 'package:shadcn_ui/shadcn_ui.dart';

/// Design tokens. The web app uses the same shadcn "violet" palette, Geist font
/// and Lucide icons (web/src/app/globals.css), so both surfaces look like one product.
abstract final class Brand {
  static const success = Color(0xFF16A34A);
  static const warning = Color(0xFFD97706);
  static const streak = Color(0xFFF59E0B);
}

abstract final class Space {
  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 12.0;
  static const lg = 16.0;
  static const xl = 24.0;
  static const xxl = 32.0;
}

abstract final class Radii {
  static const sm = Radius.circular(6);
  static const md = Radius.circular(10);
  static const lg = Radius.circular(18);
  static const pill = Radius.circular(999);
}

/// Minimum touch target (Material 48dp; above Apple's 44pt).
const kMinTouch = 48.0;

ShadThemeData shadTheme(Brightness b) => ShadThemeData(
  brightness: b,
  colorScheme: b == Brightness.light ? const ShadVioletColorScheme.light() : const ShadVioletColorScheme.dark(),
  radius: const BorderRadius.all(Radii.md),
);

/// Material widgets (Scaffold, AppBar, NavigationBar, pickers) themed from the shadcn tokens.
ThemeData materialTheme(BuildContext context) {
  final base = Theme.of(context);
  final s = ShadTheme.of(context).colorScheme;
  return base.copyWith(
    colorScheme: base.colorScheme.copyWith(
      primaryContainer: Color.alphaBlend(s.primary.withValues(alpha: 0.14), s.background),
      onPrimaryContainer: s.primary,
      surfaceContainerLow: s.card,
      surfaceContainerHigh: s.muted,
      surfaceContainerHighest: s.muted,
      onSurfaceVariant: s.mutedForeground,
      outlineVariant: s.border,
      errorContainer: Color.alphaBlend(s.destructive.withValues(alpha: 0.12), s.background),
      onErrorContainer: s.destructive,
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: s.background,
      foregroundColor: s.foreground,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0.5,
      shadowColor: s.border,
      centerTitle: false,
      iconTheme: IconThemeData(color: s.foreground, size: 22),
    ),
    navigationBarTheme: NavigationBarThemeData(
      height: 64,
      backgroundColor: s.background,
      surfaceTintColor: Colors.transparent,
      indicatorColor: Color.alphaBlend(s.primary.withValues(alpha: 0.14), s.background),
      iconTheme: WidgetStateProperty.resolveWith(
        (st) => IconThemeData(size: 22, color: st.contains(WidgetState.selected) ? s.primary : s.mutedForeground),
      ),
      labelTextStyle: WidgetStateProperty.resolveWith(
        (st) => TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: st.contains(WidgetState.selected) ? s.foreground : s.mutedForeground,
        ),
      ),
    ),
    dividerTheme: DividerThemeData(color: s.border, thickness: 1, space: 1),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: s.background,
      surfaceTintColor: Colors.transparent,
      showDragHandle: true,
      dragHandleColor: s.border,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radii.lg)),
    ),
    iconTheme: IconThemeData(size: 20, color: s.foreground),
  );
}
