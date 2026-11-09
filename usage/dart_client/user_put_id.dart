import 'package:comatype/comatype.dart';
import 'package:app/comatype_gen/user/put__id.dart' as user_put_id;

// Body is the request body of user/put__id.comat (UserData)
Future<void> userPutId(String id, user_put_id.Body userInput) async {
  final res = await c.put(
    user_put_id.endpoint,
    user_put_id.Request(params: user_put_id.Params(id: id), body: userInput),
  );

  switch (res) {
    case user_put_id.S200(:final data):
      data; // UserData
    case user_put_id.S404(:final error):
      error; // ApiError
  }
}
