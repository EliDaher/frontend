import { WaiterApp } from "@/components/waiter/WaiterApp";
export default async function Page({params}:{params:Promise<{slug:string}>}){const {slug}=await params;return <WaiterApp slug={slug}/>;}
