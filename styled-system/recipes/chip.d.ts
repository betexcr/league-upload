/* eslint-disable */
import type { ConditionalValue } from '../types/index';
import type { DistributiveOmit, Pretty } from '../types/system-types';

interface ChipVariant {
  
}

type ChipVariantMap = {
  [key in keyof ChipVariant]: Array<ChipVariant[key]>
}

export type ChipVariantProps = {
  [key in keyof ChipVariant]?: ConditionalValue<ChipVariant[key]> | undefined
}

export interface ChipRecipe {
  __type: ChipVariantProps
  (props?: ChipVariantProps): string
  raw: (props?: ChipVariantProps) => ChipVariantProps
  variantMap: ChipVariantMap
  variantKeys: Array<keyof ChipVariant>
  splitVariantProps<Props extends ChipVariantProps>(props: Props): [ChipVariantProps, Pretty<DistributiveOmit<Props, keyof ChipVariantProps>>]
  getVariantProps: (props?: ChipVariantProps) => ChipVariantProps
}


export declare const chip: ChipRecipe