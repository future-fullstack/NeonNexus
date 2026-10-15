import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseBookmarks,parsePreferences,READING_DEFAULTS} from './reading.ts';

test('unavailable or malformed local preferences keep the article readable',()=>{
  for(const raw of [null,'{broken','null','[]','false'])assert.deepEqual(parsePreferences(raw),READING_DEFAULTS);
  assert.deepEqual(parsePreferences('{"size":"huge","width":"full","focus":"yes"}'),READING_DEFAULTS);
  assert.deepEqual(parsePreferences('{"size":"large","width":"wide","focus":true}'),{size:'large',width:'wide',focus:true});
});
test('reading marks keep only bounded public slugs and numeric positions, never extra content or receipt URLs',()=>{
  const safe={slug:'first-signal',ratio:.48,heading:'section-2',updatedAt:100};
  assert.deepEqual(parseBookmarks(JSON.stringify([{...safe,body:'private body',url:'https://example.test/thread/#secret'}])),[safe]);
  for(const bad of [{...safe,slug:'thread/#secret'},{...safe,slug:'draft?token=secret'},{...safe,ratio:-1},{...safe,ratio:2},{...safe,heading:'#secret'},{...safe,updatedAt:'now'}])assert.deepEqual(parseBookmarks(JSON.stringify([bad])),[]);
  assert.deepEqual(parseBookmarks('{broken'),[]);
});
test('marks retain at most twenty recent public article positions',()=>{
  const marks=Array.from({length:30},(_,index)=>({slug:`post-${index}`,ratio:.3,heading:null,updatedAt:index+1}));
  const saved=parseBookmarks(JSON.stringify(marks));
  assert.equal(saved.length,20);
  assert.equal(saved[0].slug,'post-29');
  assert.equal(saved.at(-1)?.slug,'post-10');
});
