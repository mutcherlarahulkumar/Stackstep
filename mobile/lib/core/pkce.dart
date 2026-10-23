import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';

/// A PKCE (RFC 7636) verifier and its S256 challenge.
typedef Pkce = ({String verifier, String challenge});

Pkce createPkce([Random? random]) {
  final rng = random ?? Random.secure();
  final bytes = List<int>.generate(48, (_) => rng.nextInt(256));
  final verifier = base64Url.encode(bytes).replaceAll('=', ''); // 64 chars
  return (verifier: verifier, challenge: challengeFor(verifier));
}

String challengeFor(String verifier) =>
    base64Url.encode(sha256.convert(ascii.encode(verifier)).bytes).replaceAll('=', '');
