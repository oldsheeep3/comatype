import 'package:comatype/comatype.dart';
import 'package:app/comatype_gen/get_user.dart' as get_user;

Future<void> getUser(String id) async {
  // Req has params and search, typed from the params / search blocks of get_user.comat
  final res = await c.get(
    get_user.endpoint,
    get_user.Request(
      params: get_user.Params(id: id),
      search: get_user.Search(verbose: true), // optional, so nullable
    ),
  );

  switch (res) {
    case get_user.S200(:final data):
      data; // UserData
    case get_user.S404(:final error):
      error; // ApiError
  }
}
