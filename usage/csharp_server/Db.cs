// The app's own storage (not part of Comatype): the sample handler calls Db.User.Update
using ComatypeGen;

public static class Db
{
    public static class User
    {
        private static readonly Dictionary<Guid, Types.UserData> Users = new();

        public static Types.UserData? Update(Guid id, Types.UserData user)
        {
            lock (Users)
            {
                if (!Users.ContainsKey(id)) return null;
                Users[id] = user;
                return user;
            }
        }
    }
}
