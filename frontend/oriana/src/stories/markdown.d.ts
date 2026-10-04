// Manuscripts are bundled as plain text (see "loader" in angular.json).
declare module '*.md' {
  const text: string;
  export default text;
}
