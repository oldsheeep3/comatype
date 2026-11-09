// Handler for PUT /user/:id. Register the generated ENDPOINT with the Server
use crate::comatype_gen::types::ApiError;
use crate::comatype_gen::user_put_id::{self, Reply, Response, S200Headers};
use comatype::s::Server;

pub fn register(server: &Server, db: crate::db::Db) {
    server.put(&user_put_id::ENDPOINT, move |req| -> Reply {
        // req.params.id: Uuidv4, req.body: UserData, req.ctx.auth.user (wrap auth is on)
        let Some(user) = db.update(&req.params.id.0, req.body) else {
            return Response::S404(ApiError { code: "not_found".into(), message: "user not found".into() }, Default::default()).into();
        };
        // headerRes (X-Resource-Version) of user/defaults.comat
        let headers = S200Headers { x_resource_version: Some("v2".into()), ..Default::default() };
        Response::S200(user, headers).into()
    });
}
