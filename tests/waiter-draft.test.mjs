import assert from "node:assert/strict";
import { test } from "node:test";
import { addDraftQuantity, addDraftItemWithNote, addDraftItem, duplicateDraftLine, draftToOrderLines, restoreDraft, parseQuantity, normalizeQuantity } from "../src/components/waiter/draft.ts";
const item = {id:"salad",name:"سلطة"};
let id = 0;
const makeId = () => `line-${++id}`;

test("direct quantities support English, Arabic and Persian digits and reject invalid values", () => {
  for (const value of ["15","١٥","۱۵"]) assert.equal(parseQuantity(value),15);
  assert.equal(normalizeQuantity("١٥"),"15");
  for (const value of ["","0","٠","1000","-1","1.5","١٫٥","x"," ","1e2"]) assert.equal(parseQuantity(value),null,value);
  assert.equal(parseQuantity("1"),1); assert.equal(parseQuantity("999"),999);
});
test("ordinary additions increment only an unnoted line, preserving special instructions", () => {
  let {lines} = addDraftItem([],item,makeId);
  const original = lines[0].localId;
  lines = lines.map(line => ({...line,notes:"بدون بندورة",quantity:"2"}));
  const result = addDraftItem(lines,item,makeId);
  assert.equal(result.lines.length,2);
  assert.deepEqual(result.lines[0],{...lines[0],localId:original});
  const incremented = addDraftItem(result.lines,item,makeId);
  assert.equal(incremented.lines[1].quantity,"2");
  assert.equal(incremented.lines[0].quantity,"2");
  assert.equal(incremented.localId,result.localId);
});
test("different-note copies have independent identity, quantity and notes", () => {
  const first = addDraftItem([],item,makeId);
  first.lines[0].notes="بدون بندورة"; first.lines[0].quantity="15";
  const second=duplicateDraftLine(first.lines,first.localId,makeId);
  assert.notEqual(second.localId,first.localId);
  assert.equal(second.lines[1].quantity,"1"); assert.equal(second.lines[1].notes,"");
  const changed=second.lines.map(line=>line.localId===second.localId?{...line,quantity:"١٥",notes:"بدون ملح"}:line);
  assert.equal(changed[0].quantity,"15"); assert.equal(changed[0].notes,"بدون بندورة");
  assert.equal(changed.filter(line=>line.localId!==second.localId).length,1);
  const request=draftToOrderLines(changed);
  assert.deepEqual(request,[{menuItemId:"salad",name:"سلطة",quantity:15,notes:"بدون بندورة"},{menuItemId:"salad",name:"سلطة",quantity:15,notes:"بدون ملح"}]);
  assert.ok(request.every(line=>!("localId" in line)));
});
test("legacy drafts and queued batches restore independently and keep stable ids on reload", () => {
  const legacy=[{menuItemId:"salad",name:"سلطة",quantity:2,notes:"بدون بندورة"},{menuItemId:"salad",name:"سلطة",quantity:1,notes:""}];
  const restored=restoreDraft(legacy,makeId);
  assert.equal(new Set(restored.map(line=>line.localId)).size,2);
  assert.equal(restored[0].quantity,"2");
  assert.deepEqual(restoreDraft(JSON.parse(JSON.stringify(restored)),makeId),restored);
  const otherTable=restoreDraft(legacy,makeId); assert.notEqual(otherTable[0].localId,restored[0].localId);
  const incomplete=restoreDraft([{...restored[0],quantity:""}],makeId);
  assert.equal(incomplete[0].quantity,"");
  assert.throws(()=>draftToOrderLines(incomplete));
  assert.deepEqual(legacy[0],{menuItemId:"salad",name:"سلطة",quantity:2,notes:"بدون بندورة"});
});
test("duplicate legacy ids are repaired and quantity and batch limits stay enforced", () => {
  const lines=restoreDraft([{menuItemId:"salad",name:"سلطة",quantity:999,notes:"",localId:"same"},{menuItemId:"salad",name:"سلطة",quantity:1,notes:"special",localId:"same"}],makeId);
  assert.notEqual(lines[0].localId,lines[1].localId);
  assert.equal(addDraftItem(lines,item,makeId).lines[0].quantity,"999");
  const full=Array.from({length:100},(_,i)=>({...lines[1],localId:`full-${i}`}));
  assert.throws(()=>addDraftItem(full,item,makeId)); assert.throws(()=>duplicateDraftLine(full,full[0].localId,makeId));
});

test("adding with a note starts its own serving without changing existing quantities or notes",()=>{
 const existing=addDraftItem([],item,makeId);existing.lines[0].quantity="4";
 const added=addDraftItemWithNote(existing.lines,item,makeId);
 assert.equal(added.lines.length,2);assert.equal(added.lines[0].quantity,"4");assert.equal(added.lines[1].quantity,"1");
 assert.notEqual(added.localId,existing.localId);
 const edited=added.lines.map(line=>line.localId===added.localId?{...line,notes:"بدون بندورة"}:line);
 const ordinary=addDraftItem(edited,item,makeId);
 assert.equal(ordinary.lines[0].quantity,"5");assert.equal(ordinary.lines[1].quantity,"1");assert.equal(ordinary.lines[1].notes,"بدون بندورة");
});

test("menu quantity shortcuts add two or four units without changing noted servings",()=>{
 let result=addDraftQuantity([],item,2,makeId);
 assert.equal(result.lines[0].quantity,"2");
 result=addDraftQuantity(result.lines,item,4,makeId);
 assert.equal(result.lines[0].quantity,"6");
 result.lines[0].notes="بدون بندورة";
 const next=addDraftQuantity(result.lines,item,4,makeId);
 assert.equal(next.lines.length,2);assert.equal(next.lines[0].quantity,"6");assert.equal(next.lines[0].notes,"بدون بندورة");assert.equal(next.lines[1].quantity,"4");
 next.lines[1].quantity="998";
 assert.equal(addDraftQuantity(next.lines,item,4,makeId).lines[1].quantity,"999");
});
