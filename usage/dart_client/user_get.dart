import 'package:comatype/comatype.dart';
// user/get.comat -> GET /user. The import name is user_get, the path joined
import 'package:app/comatype_gen/user/get.dart' as user_get;

Future<void> userGet(int limit) async {
  // search is the search block of get.comat (limit?: int). It is optional, so nullable
  final res = await c.get(
    user_get.endpoint,
    user_get.Request(search: user_get.Search(limit: limit)),
  );

  switch (res) {
    case user_get.S200(:final data):
      data; // List<UserData>
    default:
      break;
  }
}
