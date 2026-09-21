import { SegmentControl } from "@nocoo/basalt";
import { getDataMode, selectDataMode } from "@/lib/data-mode";

export function DataModeSwitch() {
	if (!import.meta.env.DEV) return null;
	return (
		<SegmentControl
			legend="Data source"
			className="mr-2 [&>legend]:sr-only [&_[data-slot=segment-control-viewport]]:overflow-visible [&_[data-slot=segment-control-viewport]]:pb-0"
			value={getDataMode()}
			onValueChange={selectDataMode}
			options={[
				{ value: "mock", label: "Mock" },
				{ value: "product", label: "Product" },
			]}
		/>
	);
}
