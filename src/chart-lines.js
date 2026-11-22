// Cubic interpolation with monotone tangents. Every segment stays between its
// recorded endpoints, including at changes in direction.
function runPath(points) {
  const [first] = points;
  if (points.length === 1) return `M${first[0]},${first[1]}`;
  const slopes = points.slice(1).map(([x, y], index) => {
    const [previousX, previousY] = points[index];
    return (y - previousY) / (x - previousX);
  });
  const tangents = points.map((_, index) => {
    const left = slopes[index - 1], right = slopes[index];
    if (left === undefined) return right;
    if (right === undefined) return left;
    return left * right <= 0 ? 0 : 2 * left * right / (left + right);
  });
  return points.slice(1).reduce((path, [x, y], index) => {
    const [previousX, previousY] = points[index];
    const step = (x - previousX) / 3;
    return path + `C${previousX + step},${previousY + step * tangents[index]} ${x - step},${y - step * tangents[index + 1]} ${x},${y}`;
  }, `M${first[0]},${first[1]}`);
}

export function smoothLinePath(points) {
  const runs = [];
  for (const point of points) {
    const current = runs.at(-1);
    if (!current || point[0] <= current.at(-1)[0]) runs.push([point]);
    else current.push(point);
  }
  return runs.map(runPath).join(" ");
}
