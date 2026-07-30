import sanitizeHtml from "sanitize-html";

const allowedTags = [
  "a", "aside", "audio", "blockquote", "br", "code", "col", "colgroup", "div", "em", "figure", "figcaption", "h2", "h3", "h4", "hr", "iframe", "img", "li", "ol", "p", "section", "small", "source", "span", "strong", "table", "tbody", "td", "th", "thead", "tr", "u", "ul", "video",
  "svg", "defs", "lineargradient", "stop", "g", "circle", "clippath", "line", "path", "polygon", "polyline", "rect", "text",
];

export function sanitizeLessonHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags,
    allowedAttributes: {
      "*": ["class", "style", "title"],
      a: ["href", "target", "rel"],
      audio: ["controls", "preload", "src"],
      iframe: ["src", "width", "height", "allow", "allowfullscreen", "frameborder", "scrolling", "sandbox"],
      img: ["src", "alt", "width", "height"],
      source: ["src", "type"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
      video: ["controls", "src", "width", "height", "poster"],
      svg: ["viewbox", "width", "height", "xmlns", "fill", "stroke"],
      lineargradient: ["id", "x1", "x2", "y1", "y2"],
      stop: ["offset", "stop-color", "stop-opacity"],
      circle: ["cx", "cy", "r", "fill", "stroke", "stroke-width"],
      line: ["x1", "x2", "y1", "y2", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap"],
      path: ["d", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin"],
      polygon: ["points", "fill", "stroke", "stroke-width"],
      polyline: ["points", "fill", "stroke", "stroke-width"],
      rect: ["x", "y", "width", "height", "rx", "fill", "stroke", "stroke-width"],
      text: ["x", "y", "fill", "font-family", "font-size", "font-weight", "text-anchor"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: attribs.target === "_blank"
          ? { ...attribs, rel: "noopener noreferrer" }
          : attribs,
      }),
      audio: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, controls: "controls", preload: attribs.preload || "metadata" },
      }),
    },
  });
}
