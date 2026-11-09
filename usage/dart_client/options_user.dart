import 'package:comatype/comatype.dart';
import 'package:app/comatype_gen/options_user.dart' as options_user;

Future<void> optionsUser() async {
  // There are no params / search / body, so no request argument is needed
  final res = await c.options(options_user.endpoint);

  switch (res) {
    case options_user.S200(:final headers):
      // The second block of s200 (response headers) goes in headers
      headers.allow; // List<String>
  }
}
