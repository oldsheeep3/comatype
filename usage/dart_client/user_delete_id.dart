import 'package:comatype/comatype.dart';
import 'package:app/comatype_gen/user/delete__id.dart' as user_delete_id;

Future<void> userDeleteId(String id) async {
  final res = await c.delete(
    user_delete_id.endpoint,
    user_delete_id.Request(params: user_delete_id.Params(id: id)),
  );

  switch (res) {
    case user_delete_id.S204():
      break; // there is no data
    case user_delete_id.S404(:final error):
      error; // ApiError
  }
}
