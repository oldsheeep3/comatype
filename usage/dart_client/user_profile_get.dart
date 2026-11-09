import 'package:comatype/comatype.dart';
// user/profile/get.comat -> GET /user/profile. The import name is user_profile_get
import 'package:app/comatype_gen/user/profile/get.dart' as user_profile_get;

Future<void> userProfileGet() async {
  // There are no params / search / body, so no request argument is needed
  final res = await c.get(user_profile_get.endpoint);

  switch (res) {
    case user_profile_get.S200(:final data):
      data; // UserData
    default:
      break;
  }
}
