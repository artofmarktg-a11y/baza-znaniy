import sanitizeHtml from "sanitize-html";

const allowedTags = [
  "a", "br", "code", "div", "em", "h2", "h3", "img", "li", "ol", "p", "section", "small", "span", "strong", "table", "tbody", "td", "th", "thead", "tr", "ul",
  "svg", "defs", "lineargradient", "stop", "g", "circle", "line", "path", "polygon", "polyline", "rect", "text",
];

export function sanitizeLessonHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags,
    allowedAttributes: {
      "*": ["class", "style", "title"],
      a: ["href", "target", "rel"],
      img: ["src", "alt", "width", "height"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
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
    },
  });
}
