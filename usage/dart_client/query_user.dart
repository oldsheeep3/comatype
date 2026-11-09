import 'package:comatype/comatype.dart';
import 'package:app/comatype_gen/query_user.dart' as query_user;

// Body is the request body of query_user.comat (name / email / limit. All nullable)
Future<void> queryUser(query_user.Body condition) async {
  // QUERY sends the search criteria in the body, so pass it the same way as c.post()
  final res = await c.query(query_user.endpoint, condition);

  switch (res) {
    case query_user.S200(:final data):
      data; // List<UserData>
  }
}
