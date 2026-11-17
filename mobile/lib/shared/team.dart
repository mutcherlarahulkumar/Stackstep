import 'package:stackstep/api/models.dart';

/// Helpers for the team room (feature 29), mirrored from the web's lib/team.ts.

/// The word being typed after an "@" at the end of the text, or null.
String? mentionQuery(String text) {
  final m = RegExp(r'(^|\s)@([\p{L}\p{N}]*)$', unicode: true).firstMatch(text);
  return m?.group(2);
}

/// Members whose first name, full name or title starts with the query.
List<Persona> mentionMatches(String query, List<Persona> members) {
  final q = query.toLowerCase();
  return [
    for (final p in members)
      if ([p.name.split(RegExp(r'\s+')).first, p.name, p.title].any((s) => s.toLowerCase().startsWith(q))) p,
  ];
}

/// Replaces the "@query" being typed with "@FirstName ".
String insertMention(String text, Persona p) {
  final first = p.name.split(RegExp(r'\s+')).first;
  return text.replaceFirst(RegExp(r'@([\p{L}\p{N}]*)$', unicode: true), '@$first ');
}

/// Who said a team room message, as a display name and title.
({String name, String title, Persona? persona}) speakerOf(Message m, Team? team) {
  if (m.speakerId == null) return (name: team?.botName ?? 'Stackbot', title: team?.botTitle ?? 'AI teammate', persona: null);
  final p = team?.byId(m.speakerId);
  if (p == null) return (name: 'A former teammate', title: '', persona: null);
  return (name: p.name, title: p.title, persona: p);
}
