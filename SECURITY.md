# Security policy

## Reporting a vulnerability

**Please do not open a public issue.**

Use GitHub's private vulnerability reporting on this repository — the
**Security** tab, then *Report a vulnerability*. It goes only to the maintainer
and does not require exchanging email addresses.

If that is unavailable to you, get in touch through
**[radioterapia.ai](https://radioterapia.ai)** and say only that you have a
security report; the details can then move to a private channel.

You will get a first reply within **7 days**. If a fix is warranted it ships in
a release, and the release notes credit you unless you prefer otherwise.

## What is in scope

People describe their hospital's processes to this tool, attach their current
documents, and receive files they will print and sign. The findings that matter
most are the ones that expose what they typed or attached, or that let a document
carry something its author did not put there:

- Anything in the web interface (`site/pop-de-elite/`) that sends the conversation
  or the attachments anywhere other than the site's own API, or that keeps them
  after logout or after another person signs in on the same browser.
- Script injection through text that comes back from the language model and is
  rendered in the conversation.
- Anything that makes the document engine keep a request after answering it, or
  read or write outside the request's temporary folder.
- Anything that lets a caller use the engine's API without the `X-Pop-Token`
  configured on the server.
- Anything that writes a user's own Google AI Studio key to browser storage, a log
  or a database, or sends it anywhere other than the site's own API.
- Anything in the backend (`cloudflare/pop/`) that writes conversation content, an
  e-mail address or a key to a log, or that lets a request reach the model without
  passing the host's checks (session, daily limit, rate limit).
- A crafted JSON or logo that makes the engine produce a file that runs code when
  opened in Word, Excel or PowerPoint.

## What is already known, and is not a finding

- **The knowledge base the model consults is not in this repository.** That is by
  design, stated in the README.
- **A document with wrong content.** Every output is a draft that the
  institution's team reviews before use. A clinically wrong result is a
  correctness bug, not a vulnerability — open an issue for it, and it is welcome.
- **The engine may call Wikimedia Commons or Openverse** for a slide whose
  illustration failed, with a few English keywords and no document content. It
  can be turned off with `POP_SEM_IMAGENS=1`.

## Supported versions

The latest release. This is a small project with a single maintainer; there are
no backports.
