# Fonts

Default (free, open licence): headings **Newsreader**, UI **Instrument Sans**, code **JetBrains Mono** (Google Fonts). [Inference] They are chosen to feel similar to the app's serif headings and rounded sans UI; they are not identical.

## Using Anthropic's own typefaces
- [Unverified] The app's fonts appear to be Anthropic's brand typefaces. A design blog (type.today) reports Anthropic's site uses Styrene (Berton Hasebe) and Tiempos (Klim Type Foundry), which are commercial fonts.
- A community package "Anthropic Fonts CDN" exists on jsDelivr; its docs point to a LICENSE file and I could not confirm that licence covers the font files. A third party cannot grant rights to fonts it does not own. Risk is highest for commercial products.
- To try them anyway, change ONLY these three lines in `theme.src.css` (`--sp-font-sans`, `--sp-font-serif`, `--sp-font-mono`) plus the `@import`, then run `scripts/build.sh`. Everything else follows automatically.
