---
name: linkedin-post
description: Write a LinkedIn post in Kasper's voice, usually announcing a new blog post, talk, paper or release from this site. Short, opinionated, no hashtags. Use whenever the user asks for a LinkedIn post, a social post, an announcement, a "share this on LinkedIn", or a draft to go with something they just published, and when they ask to rewrite or shorten an existing draft.
---

# LinkedIn post

The model for this voice is Julien Chaumond's feed: a claim in the first line, the thing
that shipped in the second, a run of hard facts, a link, stop. No throat-clearing, no
hashtags, no "excited to share". A post is finished when nothing can be removed without
losing a fact.

## Shape

Five to eight lines, in four beats, separated by blank lines. LinkedIn cuts to "…see more"
after roughly 200 characters on desktop and less on mobile, so the first two beats must
carry the post on their own.

```
<the claim: a sentence someone could disagree with, or a result that sounds impossible>

<the fragment run: three or four hard facts, each its own sentence, no verbs needed>

<the turn: the one thing that makes the claim true, or the honest limit>

<one line of what it is and the link>
```

Beats three and four can merge when the post is short. The fragment run is the part that
makes it read like this feed rather than like a press release, so keep it.

## Rules

- **Take a side.** The first line is a position, not a summary. "Semantic search does not
  need a server" beats "I wrote a post about semantic search". If the work has no
  arguable claim in it, find the number that surprises and lead with that instead.
- **Hard facts, not adjectives.** 0.7 ms, 288 KB, €0, 67M parameters, 203 passages. Never
  "blazing fast", "super excited", "game changer", "deep dive", "thrilled to announce".
- **One emoji, at most, at the end of a line.** 🔥 is the house one. Never mid-sentence,
  never in the first line, never more than one in a post.
- **No hashtags. Ever.** Not even one. Not #AI, not #opensource.
- **No question to the reader** and no call to action. No "what do you think?", no "let me
  know in the comments", no "link below". The link is in the body; it speaks for itself.
- **The link goes in the post body**, on its own line, as the bare URL.
- **Name the limit** when there is one. The failure case is more interesting than the
  feature and it is what the comments will be about anyway. One line, no apology.
- **First person singular.** "I wanted", "I measured", "I have not tried". This is one
  person's work, not a team's.
- **No em-dashes (—).** Comma, colon, full stop, or a new sentence. Same rule as the site's
  prose; see the repo's CLAUDE.md.
- **No "statement, which is X" appositives.** Make the comment its own sentence.
- Lowercase openings are allowed for a throwaway post (a photo, a congratulation, a link to
  someone else's work). Not for anything with a number in it.

## Length discipline

Write it, then cut it. Typical first drafts are twice as long as they should be. Things
that always go:

- Any sentence explaining why the topic matters. The reader decides that.
- Any sentence that restates the previous one with different words.
- Adverbs, "actually", "basically", "quite", "really".
- Context the headline already gives.
- The phrase "in this post I".

## Working from a blog post

Read the actual post before drafting, not just its title. The good LinkedIn line is
usually already in there: it is the sentence the author wrote when they were being blunt.
Look in the intro, the section titles and the honest-limitation section. Pull the
measured numbers straight from the post so nothing in the draft is invented.

Offer two or three drafts with different first lines when the post has more than one
arguable claim in it. Let the user pick; do not pick for them.

## Checklist before handing it over

- [ ] First line works alone, with no context, as a scroll-stopper.
- [ ] Everything essential is above roughly 200 characters.
- [ ] Every number appears in the source material.
- [ ] Zero hashtags, at most one emoji, no question to the reader.
- [ ] No em-dash, no "excited/thrilled/deep dive/game changer".
- [ ] Read it aloud: any sentence you stumble over is too long.
- [ ] It sits next to the posts in `posts/` without sounding like a different person.

After the user picks one, save it to `posts/`.

## The corpus

`posts/` holds every post Kasper has actually published, one file per post, newest by
filename date. It is the ground truth for this voice: when the rules above and a real post
disagree, the real post wins.

**Read it before drafting.** List `posts/`, read two or three of the most recent, and match
their rhythm. Each file carries the posted text, then a "Why this one" note on what the shape
is doing and a "Not chosen" note on the drafts that lost, so the corpus records the taste and
not just the output.

**Write to it after the user picks.** When the user says which draft they want, or hands over
a post they wrote themselves, save it as `posts/YYYY-MM-DD-<slug>.md` in the format below,
with the text exactly as it will be posted. Do this without being asked; the corpus is only
worth having if it stays complete.

```markdown
---
date: YYYY-MM-DD
status: posted | draft
about: <repo path, paper, talk or release the post is about>
link: <the URL in the post, if any>
---

<the post, verbatim, blank lines and all>

---

**Why this one.** <what the shape is doing, and anything the user said about why they liked it>

**Not chosen.** <the rejected openers, one line each, and what they lost on>
```
