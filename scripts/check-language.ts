import { detect_language } from '../lib/detect-language';

const cases: [string, string | null][] = [
  ['def add(a, b):\n    return a + b\nprint(add(2, 3))', 'Python'],
  ['a = int(input())\nif a > 2:\n    print("big")', 'Python'],
  ['#include <iostream>\nusing namespace std;\nint main() {\n  cout << "hi";\n}', 'C++'],
  ['class Solution {\npublic:\n    vector<int> twoSum(vector<int>& nums, int target) {\n    }\n};', 'C++'],
  ['#include <stdio.h>\nint main(void) {\n  printf("hi");\n  return 0;\n}', 'C'],
  ['public class Main {\n  public static void main(String[] args) {\n    System.out.println("hi");\n  }\n}', 'Java'],
  ['const add = (a, b) => a + b;\nconsole.log(add(2, 3));', 'JavaScript'],
  ['function add(a, b) {\n  return a + b;\n}\nlet x = add(1, 2);', 'JavaScript'],
  ['x', null],
];

let failed = 0;
for (const [code, expected] of cases) {
  const got = detect_language(code);
  if (got !== expected) {
    failed += 1;
    console.log('FAIL', JSON.stringify(code.slice(0, 40)), 'expected', expected, 'got', got);
  }
}
if (failed) process.exit(1);
console.log('language checks passed');
