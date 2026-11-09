import comatype.Email
import comatype.Phone
import comatype.gen.*
import comatype.ktx.CK
import java.util.UUID

/** OPTIONS /user (there are no params / search / body, so just Request()) */
suspend fun optionsUser() = CK.options(OptionsUser.ENDPOINT, OptionsUser.Request())
