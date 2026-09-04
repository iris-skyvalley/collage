# Design

## The reference

Polyvore's set editor (2007–2018) is the reference, for a reason the PRD
already gives: it ran at 87,000 sets a day on an empty canvas, because the
item library was already there. Its interface did almost nothing, on purpose.

What it looked like, from the accounts that survive it — a white page; a large
square canvas; a right-hand panel with a search box, a few text tabs (items,
text, backgrounds, embellishments) and a grid of background-removed product
cutouts on white tiles with hairline grey borders; grey system-sans text; a
short row of small toolbar icons for undo, layer order, rotate and delete; a
thin outline with square corner handles on the selected item; and one dark
"Publish" button. The products were the only colour on the page. (Page fetches
were blocked from this environment, so this is reconstructed from search
summaries and prior knowledge of the editor rather than from screenshots;
sources are listed below.)

## What is kept

- **White ground, grey chrome, colour only in the work.** Every hue on screen
  belongs to a fragment or the paper. The interface is `#141414`, `#8b8a85`,
  and two hairline greys.
- **The grid of cutouts.** White tiles, hairline borders, 2px radius, the
  fragment centred. Two rows that scroll sideways. This is the tray, and the
  tray is the product.
- **Text, not chrome.** Verbs, styles and layer actions are plain words; the
  active one is dark and, where a row needs it, underlined. There are no
  chips, pills, or boxes around options.
- **One level.** There are no tabs. The dock shows the tray when nothing is
  selected and the piece's two rows — edge, material — when something is.
  Polyvore's editor had the same shape: the item panel was simply there, and
  the tools for a selected item appeared when you selected one.
- **The selection.** A hairline rectangle with four square corner handles,
  drawn white-under-black so it reads on any fragment. This is the most
  recognisable Polyvore tell and it survives intact.
- **One dark button.** Export (or *Send yours*, on a link arrival) is the only
  filled element in the editor; *Share the build* is the only one in the sheet.

## What 2026 changes

- **Mobile-first.** The canvas is full-bleed and sized to the frame; the grid
  sits under it rather than beside it. Nothing ever covers the piece.
- **No icon toolbar.** Undo and redo are two glyphs; everything else is a word.
- **No blue links.** Polyvore's one accent was link-blue. It is gone, and
  nothing replaced it.
- **The tile is the affordance.** "More like this" is a `+` in the corner of a
  tile; adding a photo is the last tile in the grid, not a button elsewhere.

## Sources

Search results consulted (the pages themselves were not reachable from the
build environment):

- [Polyvore — Wikipedia](https://en.wikipedia.org/wiki/Polyvore)
- [Remembering Polyvore: the Favourite Fashion Site of the 2010s](https://www.amelias-bloomers.com/post/remembering-polyvore-the-favourite-fashion-site-of-the-2010s)
- [Demystifying Polyvore (2010 editor walkthrough)](https://oursuburbancottage.blogspot.com/2010/05/demystifying-polyvore.html)
- [Top 10 Polyvore alternatives in 2026](https://www.fits-app.com/posts/top-10-polyvore-alternatives-the-ultimate-review)
- [Style Site Polyvore Debuts Its First Ever iPhone App — TechCrunch](https://techcrunch.com/?p=706681)
