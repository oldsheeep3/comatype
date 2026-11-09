// Client init file: import and pass the implemented ComatypeWrap
// The base url defaults to baseUrl in init.comat. Override with the COMATYPE_BASE_URL environment variable or baseUrl
// At startup, for example in main(), call initComatype() once (whether a wrapper is on or off is decided by defaults.comat and `wrap` in each .comat)
import 'package:comatype/comatype.dart';
// Library generated from init.comat
import 'package:app/comatype_gen/comatype_init.dart' as comatype_init;
import 'wrappers/auth.dart';

void initComatype() {
  c.init(
    // With the generated types, a missing wrapper declared in init.comat, or a wrong type, is a compile error
    wrappers: comatype_init.Wrappers(auth: auth),

    // Used by `cookie on` endpoints. The http client keeps the httpOnly cookie
    // (On Flutter web the browser keeps it and it is sent with credentials: include)
    cookies: true,
  );
}
