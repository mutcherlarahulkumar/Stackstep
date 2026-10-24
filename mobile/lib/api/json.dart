/// Strict JSON readers. Every API payload is decoded through these, so a
/// missing field, a wrong type or an unknown enum value fails loudly at the
/// boundary instead of surfacing as a null deep inside the UI.
library;

/// Thrown when a payload doesn't match the contract in api/openapi.yaml.
final class ContractViolation implements Exception {
  const ContractViolation(this.path, this.expected);

  final String path;
  final String expected;

  @override
  String toString() => 'ContractViolation at $path: expected $expected';
}

typedef Json = Map<String, Object?>;

extension type const JsonReader(Json raw) {
  T _req<T>(String key) {
    final value = raw[key];
    if (value is T) return value;
    throw ContractViolation(key, '$T, got ${value.runtimeType}');
  }

  String string(String key) => _req<String>(key);

  String? stringOrNull(String key) {
    final value = raw[key];
    if (value == null) return null;
    if (value is String) return value;
    throw ContractViolation(key, 'String or null');
  }

  int integer(String key) => _req<int>(key);

  int? integerOrNull(String key) {
    final value = raw[key];
    if (value == null) return null;
    if (value is int) return value;
    throw ContractViolation(key, 'int or null');
  }

  /// A list of plain values (strings, ints, bools).
  List<T> values<T>(String key) {
    final value = _req<List<Object?>>(key);
    return [
      for (final (i, item) in value.indexed)
        if (item is T) item else throw ContractViolation('$key[$i]', '$T'),
    ];
  }

  bool boolean(String key) => _req<bool>(key);

  DateTime dateTime(String key) {
    final value = string(key);
    final parsed = DateTime.tryParse(value);
    if (parsed == null) throw ContractViolation(key, 'RFC 3339 timestamp');
    return parsed.toUtc();
  }

  DateTime? dateTimeOrNull(String key) => stringOrNull(key) == null ? null : dateTime(key);

  JsonReader object(String key) => JsonReader(_req<Json>(key));

  JsonReader? objectOrNull(String key) {
    final value = raw[key];
    if (value == null) return null;
    if (value is Json) return JsonReader(value);
    throw ContractViolation(key, 'object or null');
  }

  List<T> list<T>(String key, T Function(JsonReader) decode) {
    final value = _req<List<Object?>>(key);
    return [
      for (final (i, item) in value.indexed)
        if (item is Json) decode(JsonReader(item)) else throw ContractViolation('$key[$i]', 'object'),
    ];
  }

  /// Reads a string and maps it to an enum value by its wire name.
  E enumValue<E extends Enum>(String key, List<E> values, String Function(E) wire) {
    final value = string(key);
    for (final v in values) {
      if (wire(v) == value) return v;
    }
    throw ContractViolation(key, 'one of ${values.map(wire).join(', ')}, got "$value"');
  }
}

/// Decodes a top-level JSON value as an object.
JsonReader asObject(Object? decoded) {
  if (decoded is Json) return JsonReader(decoded);
  throw const ContractViolation(r'$', 'object');
}
