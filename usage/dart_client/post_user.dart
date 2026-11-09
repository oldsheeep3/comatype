// c is the client side (a top-level instance in dart). The server side is not provided yet
// Call the methods as c.post() / c.get() / c.put() / c.delete() / c.options() / c.query()
import 'package:comatype/comatype.dart';

// Library generated from post_user.comat by `comatype generate --lang dart`
// dart has no nested classes, so import with a prefix and use it like a namespace
//   endpoint : path and method
//   Body     : the request body (the `body` line)
//   Response : a sealed class. S200 (and S401 etc.) are its subclasses
//   S200Res  : the type of the response body for status 200 (listed side by side because they cannot be nested)
import 'package:app/comatype_gen/post_user.dart' as post_user;

Future<void> postUser(post_user.Body userInput) async {
  // c.post(endpoint, body) returns a Future<post_user.Response>
  final res = await c.post(post_user.endpoint, userInput);

  // res is a post_user.Response (sealed), so a `switch` is exhaustive without default
  switch (res) {
    case post_user.S200(:final data):
      data; // post_user.S200Res (UserData without uid). nullable
  }
  // 2** is data, everything else is error
}
