// Call PUT /user/:id. Use the generated ENDPOINT and Request / Response
use crate::comatype_gen::types::UserData;
use crate::comatype_gen::user_put_id::{self, Request, Response};
use comatype::c;

pub fn put_user(id: &str, user: UserData) -> comatype::Result<()> {
    // Request has params / headers / body, typed from the params block of put__id.comat
    let res = c::put(
        &user_put_id::ENDPOINT,
        Request { params: user_put_id::Params { id: id.into() }, body: user, ..Default::default() },
    )?;

    match res {
        Response::S200(data, _headers) => drop(data), // UserData, headers are S200Headers
        Response::S404(error, _) => drop(error),      // ApiError
        _ => {}
    }
    Ok(())
}
