/* Configuração do anfitrião do POP de Elite.
 *
 * GUARDA: ESTE ARQUIVO É DO SITE: as atualizações do módulo não o substituem. Só entra aqui o que for
 * diferente do padrão. Padrões (em pop-de-elite.js):
 *   api: "/api/pop"                        backend do POP (src/pop/ no Worker do site)
 *   audio: "/api/audio/transcribe"         transcrição do site (Groq Whisper), modoAudio: "expert"
 *   chaveToken: "rtai_token"               sessão do site (vai no cabeçalho X-Token)
 *   chaveUsuario: "rtai_user"              perfil do site (o e-mail identifica o dono da conversa)
 *   chaveIdioma: "rtai_lang"               idioma do site (12 códigos)
 *   exigeSessao: true quando embutido      sem sessão, nada funciona e a conversa local é apagada
 *   espelhoUrl: "https://radioterapia-ai-pop.hf.space"   POP de Elite 1.0 (espelho e fallback)
 *   tema: "auto"                           embutido usa o tema escuro do site
 */
window.POP_DE_ELITE_CONFIG = {};
