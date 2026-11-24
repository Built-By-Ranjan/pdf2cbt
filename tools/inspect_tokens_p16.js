import fs from 'fs';
import { tokenizePages } from '../paper2cbt/src/services/tokenizer.js';
import { annotateSections } from '../paper2cbt/src/services/sectionDetector.js';
import { annotateSubjects } from '../paper2cbt/src/services/subjectDetector.js';

const data = JSON.parse(fs.readFileSync('P:/work/ptocbt/tools/file4_32pages_cache.json'));
const tokens = annotateSubjects(annotateSections(tokenizePages([data['16']])));
const slice = tokens.filter(t => t.text.includes('70.') || t.text.includes('Plication') || t.text.includes('Fothergill'));
console.log(slice);
