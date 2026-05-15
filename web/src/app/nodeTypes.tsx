import {
  DestinationRuleNode,
  EndpointsNode,
  HostNode,
  HttpProxyNode,
  IngressControllerNode,
  IngressNode,
  IngressRegionNode,
  IstioDestinationNode,
  IstioGatewayNode,
  JunctionNode,
  RouteNode,
  ServiceNode,
} from "../features/diagram/FlowNodes";

export const flowNodeTypes = {
  ingressRegion: IngressRegionNode,
  ingressController: IngressControllerNode,
  ingress: IngressNode,
  istioGateway: IstioGatewayNode,
  junction: JunctionNode,
  destinationRule: DestinationRuleNode,
  host: HostNode,
  httpProxy: HttpProxyNode,
  route: RouteNode,
  istioDestination: IstioDestinationNode,
  service: ServiceNode,
  endpoints: EndpointsNode,
};
