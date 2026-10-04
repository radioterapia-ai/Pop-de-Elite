# Trademark policy

The code is free. The name is not.

Section 6 of the [Apache License 2.0](LICENSE) grants no trademark rights, and
this file says what that means in practice — including, deliberately, what you
**may** keep. A policy that only forbids leaves the person forking it guessing,
and guessing costs them more than it protects us.

**The marks:** `Radioterapia.AI`, `POP de Elite`, and their logos.

**The holder:** Henrique Faria Braga, a natural person. *Radioterapia.AI* is a
trade name and a website, not a legal entity.

---

## Why this exists

Hospitals print and sign what this tool drafts, and it carries a declaration
that it is not validated for clinical use. A fork that keeps our name would
inherit the credibility of that declaration without inheriting the work behind
it — and the people who trusted it would have no way to tell the two apart.

So the requirement is narrow and has one purpose: **a reader must be able to
tell whose build they are running.**

---

## What you must change in a fork

If you distribute a modified version, change these:

| What | Where |
|---|---|
| The product name in the interface | the texts in `i18n/widget.json`, and the `<title>` in `site/pop-de-elite/index.html` |
| The service name of the engine's API | `space/app.py` |
| The 1.0 app header and credit | `space_v1/app.py` |
| The closing line of every training deck | "Powered by Radioterapia.AI" in `motor/ppt.py` |
| The User-Agent of image lookups | `motor/ppt.py` |
| The Space card | `space/README.md` |

These are spread over a few files. If you find one of our marks that is not on
this list, that is a defect on our side; please open an issue.

You must also keep [NOTICE](NOTICE) intact, and mark the files you changed.
Those are licence requirements (sections 4(d) and 4(b)), not trademark ones.

## What you may keep

- **Code identifiers, folder and file names**, including the Python package
  `motor` and the `pde-` prefix of the interface's CSS classes. Nobody sees
  them, and they do not tell anyone who made the product, which is the only
  thing this policy is about.
- **Factual references to the origin.** "Forked from POP de Elite", "based on
  POP de Elite by Henrique Faria Braga" — nominative use, describing what is
  true, is fine and always was.
- **The `NOTICE` and `LICENSE` files as they are.** Keeping them is required;
  it is not a trademark use.

## What is not allowed

- Naming, branding or promoting your build as `POP de Elite` or
  `Radioterapia.AI`, or as anything close enough to be confused with them.
- Using the logos to identify your build, your organisation or your service.
- Suggesting endorsement, review, certification or validation by the author when
  none happened.
- Registering these marks, or confusingly similar ones, anywhere.

## Asking

Anything not covered here, ask — including permission to use the marks for
something this file did not anticipate. Most reasonable requests get a yes.

Contact via **[radioterapia.ai](https://radioterapia.ai)**.
