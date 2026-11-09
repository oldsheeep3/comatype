// Implement a wrapper as a value of type ComatypeWrap and export it (corresponds to the `wrapper auth` of init.comat)
import 'package:comatype/comatype.dart';

final ComatypeWrap auth = (req, next) async {
  req.headers['Authorization'] = 'Bearer ${getToken()}'; // the app's own logic
  return next(req);
};
