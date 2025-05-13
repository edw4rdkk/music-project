async function authenticate (request,reply) {
    const auth = request.headers.authorization;
    if(!auth){
        return reply.code(401).send({error : "unauthorized"})
    }
    //console.log('auth header:'auth);
    const token = auth.slice(7);
    const user = await request.server.mongoose.model('User').findOne({ accessToken: token });
    if (!user) {
        return reply.code(401).send({ error: 'Invalid token' });
      }
    request.user = user;
}
module.exports = authenticate;