/* eslint-disable */
import type { ConditionalValue } from '../types/index';
import type { DistributiveOmit, Pretty } from '../types/system-types';

interface ToolbarVariant {
  /**
 * @default "comfortable"
 */
density: "comfortable" | "compact"
}

type ToolbarVariantMap = {
  [key in keyof ToolbarVariant]: Array<ToolbarVariant[key]>
}

export type ToolbarVariantProps = {
  [key in keyof ToolbarVariant]?: ConditionalValue<ToolbarVariant[key]> | undefined
}

export interface ToolbarRecipe {
  __type: ToolbarVariantProps
  (props?: ToolbarVariantProps): string
  raw: (props?: ToolbarVariantProps) => ToolbarVariantProps
  variantMap: ToolbarVariantMap
  variantKeys: Array<keyof ToolbarVariant>
  splitVariantProps<Props extends ToolbarVariantProps>(props: Props): [ToolbarVariantProps, Pretty<DistributiveOmit<Props, keyof ToolbarVariantProps>>]
  getVariantProps: (props?: ToolbarVariantProps) => ToolbarVariantProps
}


export declare const toolbar: ToolbarRecipe