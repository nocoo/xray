import { describe, expect, test } from "vitest";
import { extractArticleLinks } from "./article-links.js";

describe("article links", () => {
	test("parses Markdown and GFM links, references, formatting and autolinks", () => {
		expect(
			extractArticleLinks(`https://example.com/a#first
[**Useful** \`label\`](https://EXAMPLE.com:443/a#second)
[Later label](https://example.com/a)
[Reference][ref] and [shortcut] and [collapsed][]
<http://example.org/path?q=1#fragment>
www.example.net

[ref]: https://example.com/ref
[shortcut]: https://example.com/shortcut
[collapsed]: https://example.com/collapsed
[ref]: https://ignored.example.com/
`),
		).toEqual([
			{ url: "https://example.com/a", label: "Useful label" },
			{ url: "https://example.com/ref", label: "Reference" },
			{ url: "https://example.com/shortcut", label: "shortcut" },
			{ url: "https://example.com/collapsed", label: "collapsed" },
			{ url: "http://example.org/path?q=1", label: "http://example.org/path?q=1" },
			{ url: "http://www.example.net/", label: "www.example.net" },
		]);
	});
	test("excludes code, images, HTML, unresolved references and unsafe destinations", () => {
		expect(
			extractArticleLinks(`![Image](https://example.com/image)
![Ref image][image]

[image]: https://example.com/ref-image

\`[Code](https://example.com/inline)\`
\`\`\`md
[Code](https://example.com/fenced)
\`\`\`
<div><a href="https://example.com/html">HTML</a></div>

[Missing][unknown]
[JS](javascript:alert(1)) [Data](data:text/plain,x) [Email](mailto:a@example.com)
[Credentials](https://user:pass@example.com/) [User](https://user@example.com/)
[Relative](/path) [Fragment](#here) [Broken](https://[bad)
`),
		).toEqual([]);
	});
	test("keeps first helpful label, order and query strings; normalizes empty labels", () => {
		expect(
			extractArticleLinks(`[](https://example.com/a#first)
[![only image](https://example.com/img)](https://example.com/b)
[First helpful](https://example.com/a) [Second](https://example.com/a)
[Other](https://example.com/a?q=2)
[Multi
line](https://example.com/c)
<https://example.com/b#last>`),
		).toEqual([
			{ url: "https://example.com/a", label: "First helpful" },
			{ url: "https://example.com/b", label: "https://example.com/b" },
			{ url: "https://example.com/a?q=2", label: "Other" },
			{ url: "https://example.com/c", label: "Multi line" },
		]);
		expect(extractArticleLinks("")).toEqual([]);
	});
});
