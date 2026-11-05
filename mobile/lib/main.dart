import 'dart:developer' as developer;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:stackstep/app.dart';
import 'package:stackstep/shared/crash_view.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  // A widget that fails to build shows a friendly card in its place (release builds), never a
  // grey or red box; the cause is logged.
  ErrorWidget.builder = (details) => kDebugMode ? ErrorWidget(details.exception) : const CrashView();
  FlutterError.onError = (details) {
    FlutterError.presentError(details);
    developer.log('Flutter error', error: details.exception, stackTrace: details.stack, name: 'stackstep');
  };
  // Errors outside the widget tree (timers, futures nobody awaited) are logged, not fatal.
  PlatformDispatcher.instance.onError = (error, stack) {
    developer.log('Uncaught error', error: error, stackTrace: stack, name: 'stackstep');
    return true;
  };
  runApp(const ProviderScope(child: StackstepApp()));
}
