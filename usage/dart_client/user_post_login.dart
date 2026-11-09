import 'package:comatype/comatype.dart';
// user/post_login.comat -> POST /user/login. The import name is user_post_login
import 'package:app/comatype_gen/user/post_login.dart' as user_post_login;

Future<void> userPostLogin(user_post_login.Body input) async {
  final res = await c.post(user_post_login.endpoint, input);

  switch (res) {
    case user_post_login.S200(:final data):
      data?.uid; // String (uuidv4)
    case user_post_login.S401(:final error):
      error; // ApiError
    default:
      break; // s500 etc. from defaults.comat
  }
}
